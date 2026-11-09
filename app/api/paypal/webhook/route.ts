import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookIsGenuine } from "@/lib/paypal";

/** PayPal's own confirmation that a refund Leash issued really happened. Unsigned calls are ignored. */
export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as { event_type?: string; resource?: { id?: string } } | null;
  if (!event || !(await webhookIsGenuine(req.headers, event))) return NextResponse.json({ error: "Not from PayPal." }, { status: 400 });
  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" && event.resource?.id) {
    await db().query("update agent_actions set paypal_confirmed_at = now() where paypal_ref = $1", [event.resource.id]);
  }
  return NextResponse.json({ ok: true });
}
