import { NextResponse } from "next/server";
import { handoff } from "@/lib/session";

/** Target of the QR code: signs the phone into the same wallet, then shows the approvals. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const w = await handoff(url.searchParams.get("w") ?? "", url.searchParams.get("k") ?? "");
  return NextResponse.redirect(new URL(w ? "/approvals" : "/", url.origin));
}
