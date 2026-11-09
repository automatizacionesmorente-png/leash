import { PERIOD_MS, type Budget, type Decision, type Mandate, type Paid, type Purchase, type Reason } from "./types";

const norm = (s: string) => s.trim().toLowerCase();

function covers(budget: Budget, category: string) {
  return budget.category === "*" || budget.category === norm(category);
}

/** What has been paid inside a budget's rolling window ending at `at`. */
export function spentIn(budget: Budget, history: Paid[], currency: string, at: Date) {
  const from = at.getTime() - PERIOD_MS[budget.period];
  return history
    .filter((p) => p.currency === currency && covers(budget, p.category))
    .filter((p) => p.at.getTime() > from && p.at.getTime() <= at.getTime())
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * The only place that decides whether an agent may spend. The language model never gets here:
 * it can propose a purchase, and this pure function says allow, ask the owner, or deny.
 *
 * `approved` is set when the owner has said yes to a purchase that was waiting: the "ask" rules no
 * longer apply, but every "deny" rule is checked again, because budgets may have moved since.
 */
export function evaluate(p: Purchase, m: Mandate, history: Paid[], opts: { approved?: boolean } = {}): Decision {
  const deny: Reason[] = [];
  const ask: Reason[] = [];

  if (!Number.isSafeInteger(p.amount) || p.amount <= 0) {
    return { outcome: "deny", reasons: [{ code: "invalid_amount" }] };
  }
  if (p.currency.toUpperCase() !== m.currency) {
    return { outcome: "deny", reasons: [{ code: "currency", expected: m.currency }] };
  }

  const category = norm(p.category);
  const merchant = norm(p.merchant);
  if (m.blockedCategories.includes(category)) deny.push({ code: "blocked_category", category });
  if (m.blockedMerchants.includes(merchant)) deny.push({ code: "blocked_merchant", merchant });
  if (m.maxPerPurchase !== null && p.amount > m.maxPerPurchase) deny.push({ code: "over_max", max: m.maxPerPurchase });

  for (const budget of m.budgets) {
    if (!covers(budget, category)) continue;
    const spent = spentIn(budget, history, m.currency, p.at);
    if (spent + p.amount > budget.limit) deny.push({ code: "over_budget", budget, spent });
  }

  if (deny.length) return { outcome: "deny", reasons: deny };
  if (opts.approved) return { outcome: "allow", reasons: [] };

  if (m.askAbove !== null && p.amount > m.askAbove) ask.push({ code: "above_ask", askAbove: m.askAbove });
  if (m.askForNewMerchants && !history.some((h) => norm(h.merchant) === merchant)) {
    ask.push({ code: "new_merchant", merchant: p.merchant.trim() });
  }
  return ask.length ? { outcome: "ask", reasons: ask } : { outcome: "allow", reasons: [] };
}

export function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** One plain sentence per reason, for the owner's screen and for the agent. */
export function explain(r: Reason, currency: string): string {
  switch (r.code) {
    case "invalid_amount":
      return "The amount is not a valid price.";
    case "currency":
      return `Only ${r.expected} purchases are allowed.`;
    case "blocked_category":
      return `"${r.category}" is a blocked category.`;
    case "blocked_merchant":
      return `${r.merchant} is a blocked merchant.`;
    case "over_max":
      return `Single purchases are capped at ${money(r.max, currency)}.`;
    case "over_budget":
      return `It would break the ${r.budget.category === "*" ? "overall" : r.budget.category} budget: ${money(r.spent, currency)} of ${money(r.budget.limit, currency)} already spent this ${r.budget.period}.`;
    case "above_ask":
      return `Purchases over ${money(r.askAbove, currency)} need your OK.`;
    case "new_merchant":
      return `First purchase from ${r.merchant}.`;
  }
}
