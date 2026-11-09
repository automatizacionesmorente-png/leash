import { NextResponse } from "next/server";
import { z } from "zod";
import { compileRules, describe } from "@/lib/rules/compile";
import { Mandate } from "@/lib/rules/types";
import { TOO_MANY, modelCallAllowed } from "@/lib/rate-limit";
import { ownerWallet } from "@/lib/session";
import { saveRules } from "@/lib/wallet";

const Text = z.object({ text: z.string().trim().min(3).max(2000) });

/** Step 1: the model turns the owner's words into a policy; code writes back what it will enforce. */
export async function POST(req: Request) {
  const { text } = Text.parse(await req.json());
  if (!(await modelCallAllowed(req))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  try {
    const { mandate, unclear } = await compileRules(text);
    return NextResponse.json({ mandate, summary: describe(mandate), unclear });
  } catch {
    return NextResponse.json({ error: "Could not read those rules. Try shorter sentences." }, { status: 422 });
  }
}

/** Step 2: only the policy the owner confirmed is saved. */
export async function PUT(req: Request) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  const body = z.object({ text: z.string().max(2000), mandate: Mandate }).parse(await req.json());
  await saveRules(w.id, body.text, body.mandate);
  return NextResponse.json({ ok: true, summary: describe(body.mandate) });
}
