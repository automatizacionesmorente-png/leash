/**
 * PayPal REST (sandbox by default). The owner links their PayPal account once with a billing agreement
 * (Payment Method Tokens v3, "save without purchase"); after that Leash charges the saved account with
 * the Orders v2 API, but only for purchases the rules engine allowed or the owner approved.
 */
const API = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let cached: { token: string; until: number } | null = null;

async function token(): Promise<string> {
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
export async function charge(p: { vaultId: string; purchaseId: string; cents: number; currency: string; merchant: string; description: string }) {
  type Order = { id: string; status: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] };
  const order = await call<Order>(
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: p.purchaseId.slice(0, 256),
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
