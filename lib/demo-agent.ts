import { buy, rulesFor, status } from "./agent-tools";
import { gemini, type Content, type FunctionDecl } from "./gemini";
import type { Wallet } from "./wallet";

/** A small pretend marketplace for the demo. Prices in USD. */
export const CATALOG = [
  { merchant: "FreshMart", category: "groceries", item: "Weekly veggie box", price: 24.5 },
  { merchant: "FreshMart", category: "groceries", item: "Oat milk, 6 pack", price: 13.2 },
  { merchant: "FreshMart", category: "groceries", item: "Coffee beans 1kg", price: 21.9 },
  { merchant: "CornerShop", category: "groceries", item: "Eggs and bread", price: 8.4 },
  { merchant: "MegaTech", category: "electronics", item: "USB-C charger 65W", price: 39.99 },
  { merchant: "MegaTech", category: "electronics", item: "Noise-cancelling headphones", price: 249 },
  { merchant: "ReadMore", category: "books", item: "Paperback novel", price: 14.99 },
  { merchant: "LuckyBet", category: "gambling", item: "Casino credits", price: 50 },
  { merchant: "CoinDash", category: "crypto", item: "Bitcoin top-up", price: 100 },
  { merchant: "SkyAir", category: "travel", item: "Weekend flight Madrid-Lisbon", price: 129 },
];

const TOOLS: FunctionDecl[] = [
  {
    name: "search_catalog",
    description: "Search the marketplace. Returns items with merchant, category and price in USD.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  { name: "get_spending_rules", description: "Read the owner's spending rules.", parameters: { type: "object", properties: {} } },
  {
    name: "buy",
    description: "Pay for one item with the owner's PayPal through Leash. Returns paid, pending (owner must approve) or denied with reasons.",
    parameters: {
      type: "object",
      properties: {
        merchant: { type: "string" }, category: { type: "string" }, amount: { type: "number" },
        currency: { type: "string" }, description: { type: "string" },
      },
      required: ["merchant", "category", "amount", "description"],
    },
  },
  {
    name: "purchase_status",
    description: "Check a purchase that was pending.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

const SYSTEM = `You are a shopping agent with access to your owner's PayPal through Leash.
Do exactly what the owner asked: search the catalog, then buy each item with the buy tool, one call per item.
Leash enforces the owner's rules; you cannot change them. If a purchase is denied, do not retry it or split it into smaller purchases to get around a rule. If it is pending, tell the owner it is waiting for their approval.
Finish with a short summary, one line per item: paid, waiting for approval, or blocked and why.`;

export type Step =
  | { kind: "tool"; name: string; args: Record<string, unknown>; result: unknown }
  | { kind: "say"; text: string };

export async function runDemoAgent(w: Wallet, task: string): Promise<Step[]> {
  const steps: Step[] = [];
  const contents: Content[] = [{ role: "user", parts: [{ text: task }] }];
  for (let turn = 0; turn < 10; turn++) {
    const parts = await gemini({ system: SYSTEM, tools: TOOLS, contents });
    contents.push({ role: "model", parts });
    const calls = parts.filter((p) => p.functionCall);
    const said = parts.map((p) => p.text ?? "").join("").trim();
    if (said) steps.push({ kind: "say", text: said });
    if (!calls.length) break;
    const responses = [];
    for (const { functionCall } of calls) {
      const { name, args } = functionCall!;
      const result = await runTool(w, name, args ?? {});
      steps.push({ kind: "tool", name, args: args ?? {}, result });
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return steps;
}

async function runTool(w: Wallet, name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === "search_catalog") {
      const words = String(args.query ?? "").toLowerCase().split(/\W+/).filter((x) => x.length > 2);
      const hits = CATALOG.filter((c) => words.some((q) => `${c.item} ${c.category} ${c.merchant}`.toLowerCase().includes(q)));
      return hits.length ? hits : CATALOG;
    }
    if (name === "get_spending_rules") return rulesFor(w);
    if (name === "buy") return await buy(w, "demo-shopper", args as never);
    if (name === "purchase_status") return await status(w, String(args.id ?? ""));
    return { error: `Unknown tool ${name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tool failed" };
  }
}
