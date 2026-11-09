import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buy, status } from "@/lib/agent-tools";
import { TOO_MANY, agentCallAllowed } from "@/lib/rate-limit";
import { agentWallet } from "@/lib/session";

export async function POST(req: Request) {
  const w = await agentWallet(req);
  if (!w) return NextResponse.json({ error: "Missing or wrong agent key." }, { status: 401 });
  if (!(await agentCallAllowed(req))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  try {
    const body = await req.json();
    return NextResponse.json(await buy(w, String(body.agent ?? "agent").slice(0, 60), body));
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid purchase.", issues: e.issues }, { status: 400 });
    throw e;
  }
}

export async function GET(req: Request) {
  const w = await agentWallet(req);
  if (!w) return NextResponse.json({ error: "Missing or wrong agent key." }, { status: 401 });
  if (!(await agentCallAllowed(req))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return NextResponse.json(await status(w, id));
}
