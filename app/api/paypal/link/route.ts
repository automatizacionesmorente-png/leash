import { NextResponse } from "next/server";
import { startLink } from "@/lib/paypal";
import { ownerWallet } from "@/lib/session";

export async function POST(req: Request) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  const { approve } = await startLink(w.id, new URL(req.url).origin);
  return NextResponse.json({ approve });
}
