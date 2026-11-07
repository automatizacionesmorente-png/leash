import { z } from "zod";
import { describe } from "./rules/compile";
import { money } from "./rules/evaluate";
import { getPurchase, requestPurchase, type Wallet } from "./wallet";

/** The three things an agent can do with Leash. Shared by the MCP server and the demo shopping agent. */
export const BuyInput = z.object({
  merchant: z.string().trim().min(1).max(80).describe("Shop or seller name"),
  category: z.string().trim().min(1).max(40).describe("One lowercase word: groceries, electronics, travel, gambling..."),
  amount: z.number().positive().max(1_000_000).describe("Total price in currency units, e.g. 12.99"),
  currency: z.string().length(3).default("USD"),
  description: z.string().trim().min(1).max(120).describe("What is being bought"),
});

export function rulesFor(w: Wallet) {
  return w.mandate ? { currency: w.mandate.currency, rules: describe(w.mandate) } : { rules: ["No rules set yet: every purchase will be blocked."] };
}

export async function buy(w: Wallet, agent: string, input: z.input<typeof BuyInput>) {
  const p = BuyInput.parse(input);
  const res = await requestPurchase(w.id, { ...p, agent, amount: Math.round(p.amount * 100), currency: p.currency.toUpperCase() });
  return { ...res, amount: money(Math.round(p.amount * 100), p.currency.toUpperCase()) };
}

export async function status(w: Wallet, id: string) {
  const p = await getPurchase(w.id, id);
  return p ? { id: p.id, status: p.status, merchant: p.merchant, amount: money(p.amount, p.currency) } : { error: "No purchase with that id." };
}
