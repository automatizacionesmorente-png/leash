import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate, spentIn } from "@/lib/rules/evaluate";
import { PERIOD_MS, type Mandate, type Paid, type Purchase } from "@/lib/rules/types";

const CATS = ["groceries", "electronics", "gambling", "travel", "books"];
const SHOPS = ["freshmart", "megatech", "luckybet", "skyair", "readmore"];
const T0 = Date.UTC(2026, 10, 1);
const DAYS_60 = 60 * 24 * 3600 * 1000;

const purchase = fc.record({
  merchant: fc.constantFrom(...SHOPS),
  category: fc.constantFrom(...CATS),
  amount: fc.integer({ min: 1, max: 20_000 }),
  currency: fc.constant("USD"),
  at: fc.integer({ min: 0, max: DAYS_60 }).map((ms) => new Date(T0 + ms)),
});

const mandate: fc.Arbitrary<Mandate> = fc.record({
  currency: fc.constant("USD"),
  maxPerPurchase: fc.option(fc.integer({ min: 1, max: 15_000 }), { nil: null }),
  askAbove: fc.option(fc.integer({ min: 0, max: 15_000 }), { nil: null }),
  budgets: fc.array(
    fc.record({
      category: fc.constantFrom("*", ...CATS),
      limit: fc.integer({ min: 1, max: 30_000 }),
      period: fc.constantFrom("day" as const, "week" as const, "month" as const),
    }),
    { maxLength: 4 },
  ),
  blockedCategories: fc.subarray(CATS, { maxLength: 2 }),
  blockedMerchants: fc.subarray(SHOPS, { maxLength: 2 }),
  askForNewMerchants: fc.boolean(),
});

/** Plays a stream of purchases through the rules; the owner approves everything that asks. */
function play(m: Mandate, stream: Purchase[]): Paid[] {
  const paid: Paid[] = [];
  for (const p of [...stream].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const d = evaluate(p, m, paid);
    const final = d.outcome === "ask" ? evaluate(p, m, paid, { approved: true }) : d;
    if (final.outcome === "allow") paid.push(p);
  }
  return paid;
}

describe("spending rules: properties over any mandate and any stream of purchases", () => {
  it("never lets paid purchases break a budget, in any rolling window", () => {
    fc.assert(
      fc.property(mandate, fc.array(purchase, { maxLength: 40 }), (m, stream) => {
        const paid = play(m, stream);
        for (const b of m.budgets) for (const p of paid) {
          expect(spentIn(b, paid, "USD", p.at)).toBeLessThanOrEqual(b.limit);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("never pays a blocked category, a blocked merchant or more than the cap", () => {
    fc.assert(
      fc.property(mandate, fc.array(purchase, { maxLength: 40 }), (m, stream) => {
        for (const p of play(m, stream)) {
          expect(m.blockedCategories).not.toContain(p.category);
          expect(m.blockedMerchants).not.toContain(p.merchant);
          if (m.maxPerPurchase !== null) expect(p.amount).toBeLessThanOrEqual(m.maxPerPurchase);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("asks before anything over the approval threshold and before a new merchant", () => {
    fc.assert(
      fc.property(mandate, fc.array(purchase, { maxLength: 10 }), purchase, (m, stream, p) => {
        const paid = play(m, stream);
        const d = evaluate(p, m, paid);
        if (d.outcome !== "allow") return;
        if (m.askAbove !== null) expect(p.amount).toBeLessThanOrEqual(m.askAbove);
        if (m.askForNewMerchants) expect(paid.some((h) => h.merchant === p.merchant)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it("a cheaper version of the same purchase is never treated worse", () => {
    const rank = { allow: 0, ask: 1, deny: 2 };
    fc.assert(
      fc.property(mandate, fc.array(purchase, { maxLength: 10 }), purchase, fc.integer({ min: 1, max: 20_000 }), (m, stream, p, cheaper) => {
        const paid = play(m, stream);
        const small = { ...p, amount: Math.min(cheaper, p.amount) };
        expect(rank[evaluate(small, m, paid).outcome]).toBeLessThanOrEqual(rank[evaluate(p, m, paid).outcome]);
      }),
      { numRuns: 400 },
    );
  });

  it("approval never overrides a deny", () => {
    fc.assert(
      fc.property(mandate, fc.array(purchase, { maxLength: 10 }), purchase, (m, stream, p) => {
        const paid = play(m, stream);
        if (evaluate(p, m, paid).outcome === "deny") {
          expect(evaluate(p, m, paid, { approved: true }).outcome).toBe("deny");
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe("spending rules: examples", () => {
  const base: Mandate = {
    currency: "USD", maxPerPurchase: 20_000, askAbove: 3_000,
    budgets: [{ category: "groceries", limit: 6_000, period: "week" }],
    blockedCategories: ["gambling"], blockedMerchants: [], askForNewMerchants: false,
  };
  const at = new Date(T0);

  it("rejects bad amounts and other currencies", () => {
    expect(evaluate({ merchant: "a", category: "books", amount: 0, currency: "USD", at }, base, []).outcome).toBe("deny");
    expect(evaluate({ merchant: "a", category: "books", amount: 12.5, currency: "USD", at }, base, []).outcome).toBe("deny");
    expect(evaluate({ merchant: "a", category: "books", amount: 100, currency: "EUR", at }, base, []).outcome).toBe("deny");
  });

  it("counts only the last 7 days for a weekly budget", () => {
    const old: Paid = { merchant: "freshmart", category: "groceries", amount: 5_500, currency: "USD", at: new Date(T0 - PERIOD_MS.week - 1) };
    const p = { merchant: "freshmart", category: "Groceries", amount: 2_000, currency: "usd", at };
    expect(evaluate(p, base, [old]).outcome).toBe("allow");
    const recent = { ...old, at: new Date(T0 - 1000) };
    expect(evaluate(p, base, [recent]).reasons[0]).toMatchObject({ code: "over_budget", spent: 5_500 });
  });
});
