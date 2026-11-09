import { NextResponse } from "next/server";
import { buy } from "@/lib/agent-tools";
import { ATTACKS } from "@/lib/attack";
import { ownerWallet } from "@/lib/session";

/** Replays a hijacked agent against the owner's own wallet, through the same path every agent uses. */
export async function POST() {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  if (!w.mandate) return NextResponse.json({ error: "Confirm your rules first." }, { status: 409 });
  const results = [];
  for (const attack of ATTACKS) {
    const res = await buy(w, "hijacked-agent", attack.purchase);
    results.push({ label: attack.label, merchant: attack.purchase.merchant, category: attack.purchase.category, amount: res.amount, status: res.status, reasons: res.reasons });
  }
  return NextResponse.json({ results });
}
