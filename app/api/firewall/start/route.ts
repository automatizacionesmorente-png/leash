import { NextResponse } from "next/server";
import { startDemo } from "@/lib/firewall/demo";
import { TOO_MANY, demoStartAllowed } from "@/lib/rate-limit";
import { ownerWallet } from "@/lib/session";

export const maxDuration = 60;

/** Opens the demo shop: real sandbox orders and a fresh inbox. */
export async function POST(req: Request) {
  const w = await ownerWallet(true);
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  if (!(await demoStartAllowed(req))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  try {
    await startDemo(w);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "PayPal's sandbox did not answer. Try again in a few seconds." }, { status: 503 });
  }
}
