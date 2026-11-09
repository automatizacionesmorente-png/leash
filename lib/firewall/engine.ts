import { randomUUID } from "node:crypto";
import { PayPalMCPToolkit } from "@paypal/agent-toolkit/mcp";
import { captureFacts, PayPalError, refundCapture, token, walletTag } from "../paypal";
import { locked, type Query, type Wallet } from "../wallet";
import { decide, invoiceKey, type Call, type Policy } from "./decide";

/** Dollar limits in cents. Used until the owner writes their own rules. */
export const DEFAULT_POLICY: Policy = {
  currency: "USD", refundAskAbove: 3000, refundMax: 20000, refundPerDay: 30000, invoiceAskAbove: 10000, invoiceMax: 50000,
  blockedTools: ["accept_dispute_claim", "delete_invoice"],
};
export const DEFAULT_TEXT = "The support agent can refund up to $30 on its own and must ask me above that. Never more than $200 per refund or $300 a day. Invoices up to $100 without asking, nothing above $500. Never accept disputes or delete invoices.";

export type ActionStatus = "done" | "pending" | "denied" | "rejected" | "failed";
export type Outcome = { id: string; status: ActionStatus; reasons: string[]; result?: unknown };

const ALL = new Proxy({}, { get: () => new Proxy({}, { get: () => true }), ownKeys: () => ["invoices", "orders", "payments", "disputes", "shipment", "products", "subscriptionPlans", "subscriptions", "transactions", "insights"], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });

export async function officialToolkit() {
  return new PayPalMCPToolkit({ accessToken: await token(), configuration: { actions: ALL as never, context: { sandbox: process.env.PAYPAL_API_BASE === undefined } } });
}

async function execute(actionId: string, call: Call, cents: number | null, currency: string): Promise<{ result: unknown; ref?: string }> {
  if (call.tool === "create_refund") {
    const refund = await refundCapture({ captureId: String(call.args.capture_id), cents: cents!, currency, actionId });
    return { result: refund, ref: refund.id };
  }
  const raw = await (await officialToolkit()).getPaypalAPIService().run(call.tool, call.args);
  const result: unknown = (() => { try { return JSON.parse(raw); } catch { return raw; } })();
  const { id, href } = (result ?? {}) as { id?: unknown; href?: unknown };
  return { result, ref: typeof id === "string" ? id : typeof href === "string" ? href.split("/").pop() : undefined };
}

async function refundedToday(q: Query, walletId: string): Promise<number> {
  const { rows } = await q("select coalesce(sum(cents), 0) as total from agent_actions where wallet_id = $1 and tool = 'create_refund' and status = 'done' and created_at > now() - interval '1 day'", [walletId]);
  return Number(rows[0].total);
}

async function isDuplicate(q: Query, walletId: string, call: Call): Promise<boolean> {
  if (call.tool === "create_invoice") {
    const { rows } = await q("select args from agent_actions where wallet_id = $1 and tool = 'create_invoice' and status in ('done', 'pending') and created_at > now() - interval '10 minutes'", [walletId]);
    return rows.some((r) => invoiceKey(r.args as Record<string, unknown>) === invoiceKey(call.args));
  }
  const { rows } = await q("select 1 from agent_actions where wallet_id = $1 and tool = $2 and args = $3::jsonb and status in ('done', 'pending') and created_at > now() - interval '10 minutes' limit 1", [walletId, call.tool, JSON.stringify(call.args)]);
  return rows.length > 0;
}

function factsFor(call: Call) {
  return call.tool === "create_refund" ? captureFacts(String(call.args.capture_id ?? "")) : Promise.resolve(undefined);
}

async function run(actionId: string, call: Call, cents: number | null, currency: string) {
  try {
    const { result, ref } = await execute(actionId, call, cents, currency);
    return { status: "done" as const, result, ref, reasons: [] as string[] };
  } catch (e) {
    return { status: "failed" as const, result: undefined, ref: undefined, reasons: [e instanceof PayPalError ? `PayPal refused it (${e.status}).` : "The call to PayPal failed."] };
  }
}

/** The single door between an agent and PayPal. Runs under the wallet's lock, so two agents are decided one at a time. */
export async function callTool(walletId: string, agent: string, call: Call, trusted: { customer?: string; ticketId?: string } = {}): Promise<Outcome> {
  if (JSON.stringify(call.args).length > 20_000) return { id: "", status: "denied", reasons: ["That call is too large."] };
  return locked(walletId, async (q, w) => {
    const policy = w.firewall_policy ?? DEFAULT_POLICY;
    const id = randomUUID();
    const verdict = decide(call, { policy, walletId: walletTag(walletId), frozen: w.frozen, customer: trusted.customer, facts: await factsFor(call), refundedTodayCents: await refundedToday(q, walletId), duplicate: await isDuplicate(q, walletId, call) });
    let status: ActionStatus = verdict.outcome === "ask" ? "pending" : "denied";
    let reasons = verdict.reasons;
    let result: unknown;
    let ref: string | undefined;
    if (verdict.outcome === "allow") {
      const done = await run(id, call, verdict.cents, policy.currency);
      ({ status, result, ref } = done);
      reasons = done.reasons;
    }
    await q(
      `insert into agent_actions (id, wallet_id, ticket_id, agent, tool, args, customer, cents, currency, status, reasons, paypal_ref, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, case when $10 = 'pending' then null else now() end)`,
      [id, walletId, trusted.ticketId ?? null, agent, call.tool, JSON.stringify(call.args), trusted.customer ?? null, verdict.cents, policy.currency, status, JSON.stringify(reasons), ref ?? null],
    );
    return { id, status, reasons, result };
  });
}

/** The owner's answer. A yes asks PayPal again and re-checks every hard rule before anything runs. */
export async function answerAction(walletId: string, actionId: string, approve: boolean): Promise<Outcome> {
  return locked(walletId, async (q, w) => {
    const { rows } = await q("select * from agent_actions where wallet_id = $1 and id = $2 for update", [walletId, actionId]);
    const a = rows[0] as { id: string; tool: string; args: Record<string, unknown>; customer: string | null; status: ActionStatus; reasons: string[] } | undefined;
    if (!a) throw new Error("action not found");
    if (a.status !== "pending") return { id: a.id, status: a.status, reasons: ["Already decided."] };
    if (!approve) {
      await q("update agent_actions set status = 'rejected', decided_at = now() where id = $1", [a.id]);
      return { id: a.id, status: "rejected", reasons: [] };
    }
    const call = { tool: a.tool, args: a.args };
    const policy = (w as Wallet).firewall_policy ?? DEFAULT_POLICY;
    const verdict = decide(call, { policy, walletId: walletTag(walletId), frozen: w.frozen, customer: a.customer ?? undefined, facts: await factsFor(call), refundedTodayCents: await refundedToday(q, walletId), approved: true });
    if (verdict.outcome !== "allow") {
      await q("update agent_actions set status = 'denied', reasons = $2, decided_at = now() where id = $1", [a.id, JSON.stringify(verdict.reasons)]);
      return { id: a.id, status: "denied", reasons: verdict.reasons };
    }
    const done = await run(a.id, call, verdict.cents, policy.currency);
    await q("update agent_actions set status = $2, reasons = $3, paypal_ref = $4, cents = $5, decided_at = now() where id = $1", [a.id, done.status, JSON.stringify(done.reasons), done.ref ?? null, verdict.cents]);
    return { id: a.id, status: done.status, reasons: done.reasons, result: done.result };
  });
}
