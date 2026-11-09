import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runTicket, type Ticket } from "@/lib/firewall/agent";
import { TOO_MANY, modelCallAllowed } from "@/lib/rate-limit";
import { ownerWallet } from "@/lib/session";

export const maxDuration = 60;

/** Lets the support agent loose on one ticket. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  if (!(await modelCallAllowed(req))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  const { id } = await ctx.params;
  const { rows } = await db().query("select * from tickets where wallet_id = $1 and id = $2", [w.id, id]);
  if (!rows[0]) return NextResponse.json({ error: "No such ticket." }, { status: 404 });
  try {
    return NextResponse.json(await runTicket(rows[0] as Ticket));
  } catch {
    return NextResponse.json({ error: "The agent is busy. Try again in a few seconds." }, { status: 503 });
  }
}
