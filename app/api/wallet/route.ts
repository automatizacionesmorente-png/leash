import { NextResponse } from "next/server";
import { describe } from "@/lib/rules/compile";
import { explain, money } from "@/lib/rules/evaluate";
import { ownerWallet } from "@/lib/session";
import { listPurchases } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/** Everything the owner's screen shows. Creates a fresh sandbox wallet on the first visit. */
export async function GET() {
  const w = (await ownerWallet(true))!;
  const currency = w.mandate?.currency ?? "USD";
  const purchases = (await listPurchases(w.id)).map((p) => ({
    id: p.id, agent: p.agent, merchant: p.merchant, category: p.category, description: p.description,
    amount: money(p.amount, p.currency), cents: p.amount, status: p.status, at: p.created_at,
    reasons: p.reasons.map((r) => explain(r, currency)),
  }));
  return NextResponse.json({
    rulesText: w.rules_text,
    mandate: w.mandate,
    summary: w.mandate ? describe(w.mandate) : [],
    paypal: w.vault_id ? { linked: true, email: w.payer_email } : { linked: false },
    agentKey: w.agent_key,
    purchases,
  });
}
