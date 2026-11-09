import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { describePolicy } from "@/lib/firewall/compile";
import { DEFAULT_POLICY, DEFAULT_TEXT } from "@/lib/firewall/engine";
import { money } from "@/lib/rules/evaluate";
import { ownerWallet } from "@/lib/session";

type Row = Record<string, unknown> & { args: Record<string, unknown>; cents: number | null; currency: string };

function target(a: Row): string {
  const { args } = a;
  const recipients = args.primary_recipients as { billing_info?: { email_address?: string } }[] | undefined;
  return String(args.capture_id ?? args.dispute_id ?? args.id ?? args.invoice_id ?? recipients?.[0]?.billing_info?.email_address ?? "");
}

/** Everything the firewall screen shows. Only ever this wallet's rows. */
export async function GET() {
  const w = (await ownerWallet(true))!;
  const [tickets, actions] = await Promise.all([
    db().query("select id, customer_name, customer_email, subject, body, cents, status from tickets where wallet_id = $1 order by position", [w.id]),
    db().query("select * from agent_actions where wallet_id = $1 order by created_at desc limit 200", [w.id]),
  ]);
  const policy = w.firewall_policy ?? DEFAULT_POLICY;
  return NextResponse.json({
    text: w.firewall_text || DEFAULT_TEXT,
    lines: describePolicy(policy),
    frozen: w.frozen,
    agentKey: w.agent_key,
    phonePath: `/phone?w=${w.id}&k=${w.owner_key}`,
    tickets: tickets.rows.map((t) => ({ id: t.id, customer: t.customer_name, email: t.customer_email, subject: t.subject, body: t.body, status: t.status })),
    actions: (actions.rows as Row[]).map((a) => ({
      id: a.id, at: a.created_at, agent: a.agent, tool: a.tool, target: target(a), customer: a.customer, ticketId: a.ticket_id,
      amount: a.cents === null ? "" : money(a.cents, a.currency), status: a.status, reasons: a.reasons, paypalRef: a.paypal_ref,
    })),
  });
}
