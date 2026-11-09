import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ownerWallet } from "@/lib/session";

/** The kill switch: every agent stops on its next call. */
export async function POST(req: Request) {
  const w = await ownerWallet();
  if (!w) return NextResponse.json({ error: "No wallet." }, { status: 401 });
  const { frozen } = z.object({ frozen: z.boolean() }).parse(await req.json());
  await db().query("update wallets set frozen = $2 where id = $1", [w.id, frozen]);
  return NextResponse.json({ frozen });
}
