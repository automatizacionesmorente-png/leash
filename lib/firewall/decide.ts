import { z } from "zod";
import { money } from "../rules/evaluate";

const Cents = z.number().int().nonnegative();

/** What the owner allows agents to do on their PayPal account. Amounts are integer cents. */
export const Policy = z.object({
  currency: z.string().length(3),
  refundAskAbove: Cents.nullable(),
  refundMax: Cents,
  refundPerDay: Cents,
  invoiceAskAbove: Cents.nullable(),
  invoiceMax: Cents,
  blockedTools: z.array(z.string()),
});
export type Policy = z.infer<typeof Policy>;

type ToolClass = "read" | "refund" | "invoice" | "write" | "danger";

/** Every tool in PayPal's Agent Toolkit. A tool missing from this table is denied. */
export const TOOLS: Record<string, ToolClass> = {
  get_order: "read", get_refund: "read", get_invoice: "read", list_invoices: "read", list_disputes: "read", get_dispute: "read",
  list_products: "read", show_product_details: "read", list_subscription_plans: "read", show_subscription_plan_details: "read",
  show_subscription_details: "read", get_shipment_tracking: "read", list_transactions: "read", get_merchant_insights: "read",
  get_recurring_series: "read", search_invoicing: "read",
  create_refund: "refund",
  create_invoice: "invoice",
  send_invoice: "write", send_invoice_reminder: "write", update_invoicing: "write", generate_invoice_qr_code: "write", create_product: "write",
  update_product: "write", create_shipment_tracking: "write", update_shipment_tracking: "write", create_subscription_plan: "write", update_subscription: "write",
  generate_invoice_number: "write", setup_invoice_auto_reminders: "write", update_invoice_auto_reminder: "write", cancel_invoice_auto_reminder: "write",
  create_conditional_rules_for_invoice: "write", update_plan: "write",
  create_recurring_series: "danger", activate_recurring_series: "danger", cancel_recurring_series: "danger", delete_recurring_series: "danger",
  record_payment_for_invoice: "danger", record_refund_for_invoice: "danger",
  accept_dispute_claim: "danger", delete_invoice: "danger", cancel_sent_invoice: "danger", cancel_subscription: "danger",
  create_subscription: "danger", create_order: "danger", pay_order: "danger",
};

/** What PayPal's own records say about a capture. Nothing here comes from the agent. */
export type CaptureFacts =
  | { found: false }
  | { found: true; cents: number; refundedCents: number; currency: string; status: string; wallet: string | null; customer: string | null };

export type Call = { tool: string; args: Record<string, unknown> };

export type Context = {
  policy: Policy;
  walletId: string;
  frozen: boolean;
  /** Who the agent is acting for, set by the app and never by the model. */
  customer?: string;
  facts?: CaptureFacts;
  refundedTodayCents: number;
  /** The same write already ran or is waiting. */
  duplicate?: boolean;
  approved?: boolean;
};

export type Verdict = { outcome: "allow" | "ask" | "deny"; cents: number | null; reasons: string[] };

export function toCents(value: unknown): number | null {
  if (typeof value === "number") value = value.toFixed(2);
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, part = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0"));
}

const REPEATED = "This exact action was already made, so it was not repeated.";

/** Two invoices to the same person for the same total are the same invoice, however the items are worded. */
export function invoiceKey(args: Record<string, unknown>): string {
  const recipients = args.primary_recipients as { billing_info?: { email_address?: string } }[] | undefined;
  const items = (Array.isArray(args.items) ? args.items : []) as { quantity?: unknown; unit_amount?: { value?: unknown } }[];
  const total = items.reduce((sum, i) => sum + Math.round((toCents(i.unit_amount?.value) ?? 0) * Number(i.quantity)), 0);
  return `${recipients?.[0]?.billing_info?.email_address?.toLowerCase() ?? ""}|${total}`;
}

function refund(call: Call, c: Context): Verdict {
  const { policy: p, facts: f } = c;
  if (!f?.found) return { outcome: "deny", cents: null, reasons: ["PayPal has no record of that payment."] };
  const remaining = f.cents - f.refundedCents;
  const asked = (call.args.amount as { value?: unknown } | undefined)?.value;
  const cents = asked === undefined ? remaining : toCents(asked);
  if (cents === null) return { outcome: "deny", cents: null, reasons: ["The refund amount is not valid."] };

  // Someone else's payment is refused first, and nothing about its balance is revealed.
  if (f.wallet !== c.walletId) return { outcome: "deny", cents: f.cents, reasons: ["PayPal shows this payment belongs to another account."] };
  if (c.customer !== undefined && f.customer !== c.customer) return { outcome: "deny", cents: f.cents, reasons: ["PayPal shows this payment belongs to a different customer."] };

  if (c.duplicate) return { outcome: "deny", cents, reasons: [REPEATED] };

  const fmt = (x: number) => money(x, f.currency);
  const deny: string[] = [];
  if (remaining <= 0) deny.push("PayPal shows this payment is already fully refunded.");
  else if (cents > remaining) deny.push(`PayPal shows only ${fmt(remaining)} can still be refunded on this payment.`);
  if (cents <= 0) deny.push("The refund amount is not valid.");
  if (cents > p.refundMax) deny.push(`No refund may exceed ${fmt(p.refundMax)}.`);
  if (c.refundedTodayCents + cents > p.refundPerDay) deny.push(`It would break the daily refund limit: ${fmt(c.refundedTodayCents)} of ${fmt(p.refundPerDay)} used today.`);
  if (deny.length) return { outcome: "deny", cents, reasons: deny };
  if (!c.approved && p.refundAskAbove !== null && cents > p.refundAskAbove) {
    return { outcome: "ask", cents, reasons: [`Refunds over ${fmt(p.refundAskAbove)} need your OK.`] };
  }
  return { outcome: "allow", cents, reasons: [] };
}

function invoice(call: Call, c: Context): Verdict {
  const { policy: p } = c;
  const items = call.args.items;
  if (!Array.isArray(items) || !items.length) return { outcome: "deny", cents: null, reasons: ["The invoice has no items to price."] };
  let cents = 0;
  for (const item of items as { quantity?: unknown; unit_amount?: { value?: unknown } }[]) {
    const unit = toCents(item.unit_amount?.value);
    const quantity = Number(item.quantity);
    if (unit === null || !Number.isFinite(quantity) || quantity <= 0) return { outcome: "deny", cents: null, reasons: ["The invoice items are not valid."] };
    cents += Math.round(unit * quantity);
  }
  if (cents > p.invoiceMax) return { outcome: "deny", cents, reasons: [`No invoice may exceed ${money(p.invoiceMax, p.currency)}.`] };
  if (!c.approved && p.invoiceAskAbove !== null && cents > p.invoiceAskAbove) {
    return { outcome: "ask", cents, reasons: [`Invoices over ${money(p.invoiceAskAbove, p.currency)} need your OK.`] };
  }
  return { outcome: "allow", cents, reasons: [] };
}

/** The only code that says whether an agent's PayPal call may run. Pure: same input, same answer. */
export function decide(call: Call, c: Context): Verdict {
  if (c.frozen) return { outcome: "deny", cents: null, reasons: ["The owner cut the leash: every agent is stopped."] };
  const kind = Object.hasOwn(TOOLS, call.tool) ? TOOLS[call.tool] : undefined;
  if (!kind) return { outcome: "deny", cents: null, reasons: [`"${call.tool}" is not a tool Leash knows, so it is denied.`] };
  if (c.policy.blockedTools.includes(call.tool)) return { outcome: "deny", cents: null, reasons: [`The owner never allows "${call.tool}".`] };
  if (kind === "read") return { outcome: "allow", cents: null, reasons: [] };
  if (kind === "refund") return refund(call, c);
  if (c.duplicate) return { outcome: "deny", cents: null, reasons: [REPEATED] };
  if (kind === "invoice") return invoice(call, c);
  if (kind === "danger") return { outcome: "deny", cents: null, reasons: [`"${call.tool}" moves money or destroys records, so agents cannot use it.`] };
  return c.approved ? { outcome: "allow", cents: null, reasons: [] } : { outcome: "ask", cents: null, reasons: [`"${call.tool}" changes your account, so it needs your OK.`] };
}
