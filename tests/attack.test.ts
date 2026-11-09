import { describe, expect, it } from "vitest";
import { ATTACKS } from "../lib/attack";
import { evaluate } from "../lib/rules/evaluate";
import type { Mandate, Paid } from "../lib/rules/types";

/** The rules shown by default in the app. */
const mandate: Mandate = {
  currency: "USD",
  maxPerPurchase: null,
  askAbove: 3000,
  budgets: [
    { category: "groceries", limit: 6000, period: "week" },
    { category: "*", limit: 20000, period: "month" },
  ],
  blockedCategories: ["gambling", "crypto"],
  blockedMerchants: [],
  askForNewMerchants: true,
};

const at = new Date("2026-11-09T12:00:00Z");
const history: Paid[] = [{ merchant: "FreshMart", category: "groceries", amount: 2450, currency: "USD", at: new Date("2026-11-08T12:00:00Z") }];

describe("hijacked agent", () => {
  it("has several distinct attacks", () => {
    expect(ATTACKS.length).toBeGreaterThanOrEqual(4);
  });

  it.each(ATTACKS.map((a) => [a.label, a] as const))("%s never moves money by itself", (_label, a) => {
    const decision = evaluate({ ...a.purchase, amount: Math.round(a.purchase.amount * 100), currency: "USD", at }, mandate, history);
    expect(decision.outcome).not.toBe("allow");
  });

  it("is stopped outright when it uses the real category", () => {
    const honest = ATTACKS.find((a) => a.purchase.category === "crypto")!;
    const decision = evaluate({ ...honest.purchase, amount: Math.round(honest.purchase.amount * 100), currency: "USD", at }, mandate, history);
    expect(decision.outcome).toBe("deny");
  });
});
