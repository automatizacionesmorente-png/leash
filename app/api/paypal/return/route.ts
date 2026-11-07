import { NextResponse } from "next/server";
import { finishLink } from "@/lib/paypal";
import { ownerWallet } from "@/lib/session";
import { saveVault } from "@/lib/wallet";

/** PayPal sends the owner back here after they approve the billing agreement. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const w = await ownerWallet();
  const token = url.searchParams.get("approval_token_id") ?? url.searchParams.get("token");
  if (!w || !token || url.searchParams.get("wallet") !== w.id) {
    return NextResponse.redirect(new URL("/?linked=failed", url.origin));
  }
  try {
    const { vaultId, email } = await finishLink(token);
    await saveVault(w.id, vaultId, email);
    return NextResponse.redirect(new URL("/?linked=ok", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/?linked=failed", url.origin));
  }
}
