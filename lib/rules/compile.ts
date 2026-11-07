import { z } from "zod";
import { gemini } from "@/lib/gemini";
import { money } from "./evaluate";
import { Mandate } from "./types";

/** What the model is allowed to return: amounts in currency units, which code turns into cents. */
const Draft = z.object({
  currency: z.string().length(3),
  maxPerPurchase: z.number().positive().nullable(),
  askAbove: z.number().nonnegative().nullable(),
  budgets: z.array(z.object({ category: z.string(), limit: z.number().positive(), period: z.enum(["day", "week", "month"]) })),
  blockedCategories: z.array(z.string()),
  blockedMerchants: z.array(z.string()),
  askForNewMerchants: z.boolean(),
  unclear: z.array(z.string()),
});

const SCHEMA = {
  type: "object",
  properties: {
    currency: { type: "string", description: "ISO 4217 code; USD unless the owner names another" },
    maxPerPurchase: { type: "number", nullable: true },
    askAbove: { type: "number", nullable: true },
    budgets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", description: 'lowercase single word, or "*" for all spending' },
          limit: { type: "number" },
          period: { type: "string", enum: ["day", "week", "month"] },
        },
        required: ["category", "limit", "period"],
      },
    },
    blockedCategories: { type: "array", items: { type: "string" } },
    blockedMerchants: { type: "array", items: { type: "string" } },
    askForNewMerchants: { type: "boolean" },
    unclear: { type: "array", items: { type: "string" }, description: "rules you could not express; never guess them" },
  },
  required: ["currency", "maxPerPurchase", "askAbove", "budgets", "blockedCategories", "blockedMerchants", "askForNewMerchants", "unclear"],
};

const SYSTEM = `You turn a person's spending rules for their AI agents into a strict JSON policy.
- Amounts are in currency units (60 means 60.00), never cents.
- Categories are lowercase single words: groceries, electronics, travel, food, gambling, crypto, subscriptions, clothing, books, gaming, alcohol, entertainment.
- "never X" or "no X" means blockedCategories (or blockedMerchants when it names a shop).
- "ask me above N" means askAbove. "max N per purchase" means maxPerPurchase.
- "only shops I've used before" or "ask for new shops" means askForNewMerchants: true.
- Anything you cannot express with these fields goes in "unclear", word for word. Do not invent rules.`;

const cents = (x: number) => Math.round(x * 100);

export async function compileRules(text: string): Promise<{ mandate: Mandate; unclear: string[] }> {
  const parts = await gemini({ system: SYSTEM, json: SCHEMA, contents: [{ role: "user", parts: [{ text }] }] });
  const draft = Draft.parse(JSON.parse(parts.map((p) => p.text ?? "").join("")));
  const mandate = Mandate.parse({
    currency: draft.currency,
    maxPerPurchase: draft.maxPerPurchase === null ? null : cents(draft.maxPerPurchase),
    askAbove: draft.askAbove === null ? null : cents(draft.askAbove),
    budgets: draft.budgets.map((b) => ({ ...b, limit: cents(b.limit) })),
    blockedCategories: draft.blockedCategories,
    blockedMerchants: draft.blockedMerchants,
    askForNewMerchants: draft.askForNewMerchants,
  });
  return { mandate, unclear: draft.unclear };
}

/** Written by code, not by the model, so the owner confirms exactly what will be enforced. */
export function describe(m: Mandate): string[] {
  const c = m.currency;
  const lines: string[] = [];
  for (const b of m.budgets) {
    lines.push(`At most ${money(b.limit, c)} per ${b.period} on ${b.category === "*" ? "everything" : b.category}.`);
  }
  if (m.maxPerPurchase !== null) lines.push(`No single purchase over ${money(m.maxPerPurchase, c)}.`);
  if (m.askAbove !== null) lines.push(`Ask me before anything over ${money(m.askAbove, c)}.`);
  if (m.askForNewMerchants) lines.push("Ask me before the first purchase from a new shop.");
  if (m.blockedCategories.length) lines.push(`Never: ${m.blockedCategories.join(", ")}.`);
  if (m.blockedMerchants.length) lines.push(`Never buy from: ${m.blockedMerchants.join(", ")}.`);
  if (!lines.length) lines.push("No limits: every purchase is allowed.");
  return lines;
}
