/**
 * PayPal REST (sandbox by default). The owner links their PayPal account once with a billing agreement
 * (Payment Method Tokens v3, "save without purchase"); after that Leash charges the saved account with
 * the Orders v2 API, but only for purchases the rules engine allowed or the owner approved.
 */
const API = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let cached: { token: string; until: number } | null = null;

export async function token(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal sandbox keys are not set");
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

async function call<T>(path: string, body: unknown, requestId?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await token()}`,
      "content-type": "application/json",
      prefer: "return=representation",
      // Same id, same result: a retried charge can never be paid twice.
      ...(requestId && { "paypal-request-id": requestId }),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PayPalError(res.status, data);
  return data as T;
}

async function read<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${await token()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PayPalError(res.status, data);
  return data as T;
}

export class PayPalError extends Error {
  constructor(public status: number, public details: unknown) {
    super(`PayPal ${status}: ${JSON.stringify(details).slice(0, 300)}`);
  }
}

type Link = { href: string; rel: string };

/** Step 1 of linking: returns the PayPal page where the owner approves the billing agreement. */
export async function startLink(walletId: string, origin: string) {
  const data = await call<{ id: string; links: Link[] }>("/v3/vault/setup-tokens", {
    payment_source: {
      paypal: {
        description: "Leash: pays only what your rules allow",
        usage_pattern: "IMMEDIATE",
        usage_type: "MERCHANT",
        customer_type: "CONSUMER",
        experience_context: {
          brand_name: "Leash",
          shipping_preference: "NO_SHIPPING",
          return_url: `${origin}/api/paypal/return?wallet=${walletId}`,
          cancel_url: `${origin}/?linked=cancelled`,
        },
      },
    },
  });
  const approve = data.links.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal returned no approval link");
  return { setupToken: data.id, approve };
}

/** Step 2: after approval, the setup token becomes a saved payment method. */
export async function finishLink(setupToken: string) {
  const data = await call<{ id: string; payment_source?: { paypal?: { email_address?: string } } }>("/v3/vault/payment-tokens", {
    payment_source: { token: { id: setupToken, type: "SETUP_TOKEN" } },
  });
  return { vaultId: data.id, email: data.payment_source?.paypal?.email_address ?? null };
}

/** Charges the saved PayPal account. `purchaseId` makes the request idempotent. */
export async function charge(p: { vaultId: string; purchaseId: string; cents: number; currency: string; merchant: string; description: string; customId?: string }) {
  type Order = { id: string; status: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] };
  const order = await call<Order>(
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: p.purchaseId.slice(0, 256),
        ...(p.customId && { custom_id: p.customId.slice(0, 127) }),
        description: `${p.merchant}: ${p.description}`.slice(0, 127),
        amount: { currency_code: p.currency, value: (p.cents / 100).toFixed(2) },
      }],
      payment_source: { paypal: { vault_id: p.vaultId } },
    },
    p.purchaseId,
  );
  let done = order;
  if (order.status === "APPROVED") done = await call<Order>(`/v2/checkout/orders/${order.id}/capture`, {}, `${p.purchaseId}-capture`);
  const capture = done.purchase_units?.[0]?.payments?.captures?.[0];
  if (done.status !== "COMPLETED" || !capture) throw new PayPalError(402, { status: done.status, order: order.id });
  return { orderId: done.id, captureId: capture.id };
}

type Money = { value: string; currency_code: string };
type Capture = { amount: Money; status: string; links: Link[] };
type OrderRecord = { purchase_units: { custom_id?: string; payments?: { refunds?: { status: string; amount: Money }[] } }[] };

const cents = (m: Money) => Math.round(Number(m.value) * 100);

/** What PayPal itself says about a payment: how much, how much is already refunded, and whose it is. */
export async function captureFacts(captureId: string) {
  if (!/^[A-Z0-9]{8,32}$/.test(captureId)) return { found: false as const };
  try {
    const capture = await read<Capture>(`/v2/payments/captures/${captureId}`);
    const up = capture.links.find((l) => l.rel === "up")?.href.split("/").pop();
    const order = up ? await read<OrderRecord>(`/v2/checkout/orders/${up}`) : null;
    const unit = order?.purchase_units[0];
    const refundedCents = (unit?.payments?.refunds ?? []).filter((r) => r.status === "COMPLETED").reduce((sum, r) => sum + cents(r.amount), 0);
    const [wallet, customer] = (unit?.custom_id ?? "").split("|");
    return { found: true as const, cents: cents(capture.amount), refundedCents, currency: capture.amount.currency_code, status: capture.status, wallet: wallet || null, customer: customer || null };
  } catch (e) {
    if (e instanceof PayPalError && (e.status === 404 || e.status === 400)) return { found: false as const };
    throw e;
  }
}

/** Refunds go straight to REST because the Agent Toolkit cannot send a PayPal-Request-Id: a retry must never pay twice. */
export async function refundCapture(p: { captureId: string; cents: number; currency: string; actionId: string }) {
  return call<{ id: string; status: string }>(`/v2/payments/captures/${p.captureId}/refund`, {
    amount: { value: (p.cents / 100).toFixed(2), currency_code: p.currency },
    note_to_payer: "Refund issued through Leash",
  }, p.actionId);
}

/** Asks PayPal whether a webhook really came from PayPal. Without a configured webhook id nothing is believed. */
export async function webhookIsGenuine(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const get = (name: string) => headers.get(`paypal-${name}`);
  const fields = { auth_algo: get("auth-algo"), cert_url: get("cert-url"), transmission_id: get("transmission-id"), transmission_sig: get("transmission-sig"), transmission_time: get("transmission-time") };
  if (Object.values(fields).some((v) => !v)) return false;
  const check = await call<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", { ...fields, webhook_id: webhookId, webhook_event: event }).catch(() => null);
  return check?.verification_status === "SUCCESS";
}
