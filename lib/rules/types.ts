import { z } from "zod";

/** Money is always integer cents, so a budget can never drift by a rounding error. */
export const Cents = z.number().int().positive();

export const Period = z.enum(["day", "week", "month"]);
export type Period = z.infer<typeof Period>;

/** Rolling windows: "week" means the last 7 days, whatever weekday it is. */
export const PERIOD_MS: Record<Period, number> = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  month: 30 * 24 * 3600 * 1000,
};

export const Budget = z.object({
  /** A category name, or "*" for everything the agent buys. */
  category: z.string().trim().min(1).toLowerCase(),
  limit: Cents,
  period: Period,
});
export type Budget = z.infer<typeof Budget>;

export const Mandate = z.object({
  currency: z.string().length(3).toUpperCase(),
  /** Hard ceiling for a single purchase. */
  maxPerPurchase: Cents.nullable(),
  /** Purchases above this wait for the owner's approval. */
  askAbove: z.number().int().nonnegative().nullable(),
  budgets: z.array(Budget),
  blockedCategories: z.array(z.string().trim().min(1).toLowerCase()),
  blockedMerchants: z.array(z.string().trim().min(1).toLowerCase()),
  /** The first purchase from a merchant never paid before waits for approval. */
  askForNewMerchants: z.boolean(),
});
export type Mandate = z.infer<typeof Mandate>;

export type Purchase = {
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  at: Date;
};

/** A purchase that was actually paid. Only these count against budgets. */
export type Paid = Purchase;

export type Reason =
  | { code: "invalid_amount" }
  | { code: "currency"; expected: string }
  | { code: "blocked_category"; category: string }
  | { code: "blocked_merchant"; merchant: string }
  | { code: "over_max"; max: number }
  | { code: "over_budget"; budget: Budget; spent: number }
  | { code: "above_ask"; askAbove: number }
  | { code: "new_merchant"; merchant: string };

export type Outcome = "allow" | "ask" | "deny";

export type Decision = { outcome: Outcome; reasons: Reason[] };
