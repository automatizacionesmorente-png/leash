import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerWallet } from "@/lib/session";
import { decide } from "@/lib/wallet";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  const { id } = await ctx.params;
  const { approve } = z.object({ approve: z.boolean() }).parse(await req.json());
  return NextResponse.json(await decide(w.id, z.string().uuid().parse(id), approve));
}
