import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decide, toCents, TOOLS, type CaptureFacts, type Context, type Policy } from "../lib/firewall/decide";

const policy: Policy = { currency: "USD", refundAskAbove: 3000, refundMax: 20000, refundPerDay: 30000, invoiceAskAbove: 10000, invoiceMax: 50000, blockedTools: ["accept_dispute_claim"] };
const facts = (over: Partial<Extract<CaptureFacts, { found: true }>> = {}): CaptureFacts => ({ found: true, cents: 1800, refundedCents: 0, currency: "USD", status: "COMPLETED", wallet: "w1", customer: "maya@example.com", ...over });
const ctx = (over: Partial<Context> = {}): Context => ({ policy, walletId: "w1", frozen: false, facts: facts(), refundedTodayCents: 0, ...over });
const refund = (value?: string) => ({ tool: "create_refund", args: { capture_id: "C1", ...(value && { amount: { value, currency_code: "USD" } }) } });

describe("the firewall", () => {
  it("allows a small refund that PayPal's records support", () => {
    expect(decide(refund("18.00"), ctx()).outcome).toBe("allow");
  });
  it("treats a refund with no amount as refunding everything left", () => {
    expect(decide(refund(), ctx()).cents).toBe(1800);
  });
  it("asks above the limit and an approval gets past the ask", () => {
    const f = facts({ cents: 12000 });
    expect(decide(refund("120.00"), ctx({ facts: f })).outcome).toBe("ask");
    expect(decide(refund("120.00"), ctx({ facts: f, approved: true })).outcome).toBe("allow");
  });
  it("denies a payment PayPal does not know", () => {
    expect(decide(refund("1.00"), ctx({ facts: { found: false } })).outcome).toBe("deny");
  });
  it("denies another customer's payment even when the amount is fine", () => {
    expect(decide(refund("18.00"), ctx({ customer: "eve@example.com" })).reasons.join()).toMatch(/different customer/);
  });
  it("denies refunding an already refunded payment", () => {
    expect(decide(refund("18.00"), ctx({ facts: facts({ refundedCents: 1800 }) })).reasons.join()).toMatch(/already fully refunded/);
  });
  it("denies dangerous tools, unknown tools and blocked tools", () => {
    for (const tool of ["delete_invoice", "transfer_everything", "accept_dispute_claim", "__proto__", "constructor"]) {
      expect(decide({ tool, args: {} }, ctx()).outcome).toBe("deny");
    }
  });
  it("cutting the leash stops even reads and approvals", () => {
    expect(decide({ tool: "get_order", args: {} }, ctx({ frozen: true })).outcome).toBe("deny");
    expect(decide(refund("1.00"), ctx({ frozen: true, approved: true })).outcome).toBe("deny");
  });
  it("prices an invoice from its items, not from what the agent claims", () => {
    const call = { tool: "create_invoice", args: { total: "1.00", items: [{ quantity: "3", unit_amount: { value: "200.00" } }] } };
    expect(decide(call, ctx()).outcome).toBe("deny");
  });
  it("never repeats a write that already happened, but reads are free", () => {
    expect(decide(refund("1.00"), ctx({ duplicate: true })).outcome).toBe("deny");
    expect(decide({ tool: "get_order", args: {} }, ctx({ duplicate: true })).outcome).toBe("allow");
  });
  it("reads money without floating point", () => {
    expect(toCents("19.99")).toBe(1999);
    expect(toCents("-1")).toBeNull();
    expect(toCents("1e9")).toBeNull();
  });
  it("classifies every tool in the table", () => {
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(47);
  });
});

const amount = fc.integer({ min: 1, max: 100_000 });
const asMoney = (c: number) => (c / 100).toFixed(2);

describe("properties", () => {
  it("no sequence of refunds, approved or not, ever exceeds the daily limit", () => {
    fc.assert(fc.property(fc.array(amount, { maxLength: 40 }), fc.boolean(), (list, approved) => {
      let today = 0;
      for (const cents of list) {
        const v = decide(refund(asMoney(cents)), ctx({ facts: facts({ cents: 100_000 }), refundedTodayCents: today, approved }));
        if (v.outcome === "allow") today += cents;
      }
      expect(today).toBeLessThanOrEqual(policy.refundPerDay);
    }), { numRuns: 400 });
  });
  it("an approval never unlocks another customer's payment", () => {
    fc.assert(fc.property(amount, fc.string(), (cents, who) => {
      fc.pre(who !== "maya@example.com");
      expect(decide(refund(asMoney(cents)), ctx({ customer: who, approved: true, facts: facts({ cents: 100_000 }) })).outcome).toBe("deny");
    }), { numRuns: 400 });
  });
  it("never allows more than PayPal says is left on the payment", () => {
    fc.assert(fc.property(amount, amount, fc.boolean(), (cents, paid, approved) => {
      fc.pre(cents > paid);
      expect(decide(refund(asMoney(cents)), ctx({ facts: facts({ cents: paid }), approved })).outcome).toBe("deny");
    }), { numRuns: 400 });
  });
});
