import { randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import { charge, PayPalError } from "./paypal";
import { evaluate, explain } from "./rules/evaluate";
import type { Policy as FirewallPolicy } from "./firewall/decide";
import { Mandate, type Paid, type Reason } from "./rules/types";

export type Status = "paid" | "pending" | "denied" | "rejected" | "failed";

export type PurchaseRow = {
  id: string; agent: string; merchant: string; category: string; amount: number; currency: string;
  description: string; created_at: Date; status: Status; reasons: Reason[]; paypal_order_id: string | null;
};

export type Wallet = {
  id: string; rules_text: string; mandate: Mandate | null; vault_id: string | null; payer_email: string | null; agent_key: string; owner_key: string;
  firewall_policy: FirewallPolicy | null; firewall_text: string; frozen: boolean;
};

export type PurchaseRequest = { agent: string; merchant: string; category: string; amount: number; currency: string; description: string };

export async function createWallet(): Promise<Wallet> {
  const id = randomUUID();
  const key = `lsh_${randomBytes(24).toString("base64url")}`;
  const owner = randomBytes(24).toString("base64url");
  const { rows } = await db().query("insert into wallets (id, agent_key, owner_key) values ($1, $2, $3) returning *", [id, key, owner]);
  return rows[0];
}

export async function getWallet(id: string): Promise<Wallet | null> {
  const { rows } = await db().query("select * from wallets where id = $1", [id]);
  return rows[0] ?? null;
}

export async function walletByOwnerKey(id: string, key: string): Promise<Wallet | null> {
  const { rows } = await db().query("select * from wallets where id = $1 and owner_key = $2", [id, key]);
  return rows[0] ?? null;
}

export async function walletByAgentKey(key: string): Promise<Wallet | null> {
  const { rows } = await db().query("select * from wallets where agent_key = $1", [key]);
  return rows[0] ?? null;
}

export async function saveRules(id: string, text: string, mandate: Mandate) {
  await db().query("update wallets set rules_text = $2, mandate = $3 where id = $1", [id, text, JSON.stringify(Mandate.parse(mandate))]);
}

export async function saveVault(id: string, vaultId: string, email: string | null) {
  await db().query("update wallets set vault_id = $2, payer_email = $3 where id = $1", [id, vaultId, email]);
}

export async function listPurchases(walletId: string, limit = 50): Promise<PurchaseRow[]> {
  const { rows } = await db().query("select * from purchases where wallet_id = $1 order by created_at desc limit $2", [walletId, limit]);
  return rows;
}

export async function getPurchase(walletId: string, id: string): Promise<PurchaseRow | null> {
  const { rows } = await db().query("select * from purchases where wallet_id = $1 and id = $2", [walletId, id]);
  return rows[0] ?? null;
}

/**
 * Every spending decision runs inside one transaction holding the wallet's row lock, so two agents
 * buying at the same moment are decided one after the other and can never overspend a budget together.
 */
type Row = Record<string, unknown>;
export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

export async function locked<T>(walletId: string, fn: (q: Query, w: Wallet) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from wallets where id = $1 for update", [walletId]);
    if (!rows[0]) throw new Error("wallet not found");
    const out = await fn((sql, params) => client.query(sql, params as unknown[]), rows[0] as Wallet);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

async function paidHistory(q: Query, walletId: string): Promise<Paid[]> {
  const { rows } = await q(
    "select merchant, category, amount, currency, created_at from purchases where wallet_id = $1 and status = 'paid' and created_at > now() - interval '31 days'",
    [walletId],
  );
  return rows.map((r) => ({
    merchant: String(r.merchant), category: String(r.category), amount: Number(r.amount), currency: String(r.currency), at: new Date(r.created_at as string),
  }));
}

async function pay(w: Wallet, purchaseId: string, r: PurchaseRequest): Promise<{ status: Status; orderId?: string; error?: string }> {
  if (!w.vault_id) return { status: "failed", error: "No PayPal account is linked yet." };
  try {
    const { orderId } = await charge({ vaultId: w.vault_id, purchaseId, cents: r.amount, currency: r.currency, merchant: r.merchant, description: r.description });
    return { status: "paid", orderId };
  } catch (e) {
    return { status: "failed", error: e instanceof PayPalError ? `PayPal declined the payment (${e.status}).` : "Payment failed." };
  }
}

export type Answer = { id: string; status: Status; message: string; reasons: string[]; paypalOrderId?: string };

/** What an agent calls to spend. The rules decide; the agent only gets the verdict and why. */
export async function requestPurchase(walletId: string, r: PurchaseRequest): Promise<Answer> {
  return locked(walletId, async (q, w) => {
    if (w.frozen) return { id: "", status: "denied" as Status, message: "The owner cut the leash: every agent is stopped.", reasons: [] };
    if (!w.mandate) return { id: "", status: "denied" as Status, message: "The owner has not set any spending rules yet.", reasons: [] };
    const id = randomUUID();
    const decision = evaluate({ ...r, at: new Date() }, w.mandate, await paidHistory(q, walletId));
    const text = decision.reasons.map((x) => explain(x, w.mandate!.currency));
    let status: Status = decision.outcome === "allow" ? "paid" : decision.outcome === "ask" ? "pending" : "denied";
    let orderId: string | undefined;
    let error: string | undefined;
    if (status === "paid") ({ status, orderId, error } = await pay(w, id, r));
    await q(
      `insert into purchases (id, wallet_id, agent, merchant, category, amount, currency, description, status, reasons, paypal_order_id, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, case when $9 = 'pending' then null else now() end)`,
      [id, walletId, r.agent, r.merchant, r.category, r.amount, r.currency.toUpperCase(), r.description, status, JSON.stringify(decision.reasons), orderId ?? null],
    );
    const message = {
      paid: "Paid with PayPal.",
      pending: "Waiting for the owner's approval. Check back with the purchase id.",
      denied: "Blocked by the owner's spending rules.",
      rejected: "The owner said no.",
      failed: error ?? "Payment failed.",
    }[status];
    return { id, status, message, reasons: text, paypalOrderId: orderId };
  });
}

/** The owner's yes or no on a waiting purchase. A yes re-checks every hard rule before paying. */
export async function decide(walletId: string, purchaseId: string, approve: boolean): Promise<Answer> {
  return locked(walletId, async (q, w) => {
    const { rows } = await q("select * from purchases where wallet_id = $1 and id = $2 for update", [walletId, purchaseId]);
    const p = rows[0] as PurchaseRow | undefined;
    if (!p) throw new Error("purchase not found");
    if (p.status !== "pending") return { id: p.id, status: p.status, message: "Already decided.", reasons: [] };
    if (!approve) {
      await q("update purchases set status = 'rejected', decided_at = now() where id = $1", [p.id]);
      return { id: p.id, status: "rejected" as Status, message: "Rejected.", reasons: [] };
    }
    const r: PurchaseRequest = { agent: p.agent, merchant: p.merchant, category: p.category, amount: p.amount, currency: p.currency, description: p.description };
    const decision = evaluate({ ...r, at: new Date() }, w.mandate!, await paidHistory(q, walletId), { approved: true });
    if (decision.outcome === "deny") {
      await q("update purchases set status = 'denied', reasons = $2, decided_at = now() where id = $1", [p.id, JSON.stringify(decision.reasons)]);
      return { id: p.id, status: "denied" as Status, message: "Your rules changed since: it is no longer allowed.", reasons: decision.reasons.map((x) => explain(x, w.mandate!.currency)) };
    }
    const paid = await pay(w, p.id, r);
    await q("update purchases set status = $2, paypal_order_id = $3, decided_at = now() where id = $1", [p.id, paid.status, paid.orderId ?? null]);
    return { id: p.id, status: paid.status, message: paid.status === "paid" ? "Approved and paid with PayPal." : paid.error ?? "Payment failed.", reasons: [], paypalOrderId: paid.orderId };
  });
}
