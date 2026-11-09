import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { compilePolicy, describePolicy } from "@/lib/firewall/compile";
import { Policy } from "@/lib/firewall/decide";
import { TOO_MANY, modelCallAllowed } from "@/lib/rate-limit";
import { ownerWallet } from "@/lib/session";

/** The model drafts the policy from the owner's words. Nothing is saved yet. */
export async function POST(req: Request) {
  const { text } = z.object({ text: z.string().trim().min(3).max(2000) }).parse(await req.json());
  if (!(await modelCallAllowed(req))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  try {
    const { policy, unclear } = await compilePolicy(text);
    return NextResponse.json({ policy, lines: describePolicy(policy), unclear });
  } catch {
    return NextResponse.json({ error: "Could not read those rules. Try shorter sentences." }, { status: 422 });
  }
}

/** Only what the owner confirmed is enforced. */
export async function PUT(req: Request) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  const body = z.object({ text: z.string().max(2000), policy: Policy }).parse(await req.json());
  await db().query("update wallets set firewall_policy = $2, firewall_text = $3 where id = $1", [w.id, JSON.stringify(body.policy), body.text]);
  return NextResponse.json({ ok: true });
}
