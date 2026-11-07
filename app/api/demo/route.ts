import { NextResponse } from "next/server";
import { z } from "zod";
import { runDemoAgent } from "@/lib/demo-agent";
import { ownerWallet } from "@/lib/session";

export const maxDuration = 60;

export async function POST(req: Request) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  const { task } = z.object({ task: z.string().trim().min(3).max(500) }).parse(await req.json());
  try {
    return NextResponse.json({ steps: await runDemoAgent(w, task) });
  } catch {
    return NextResponse.json({ error: "The demo agent is busy. Try again in a few seconds." }, { status: 503 });
  }
}
