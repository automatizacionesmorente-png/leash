import { z } from "zod";
import { gemini } from "../gemini";
import { money } from "../rules/evaluate";
import { Policy, TOOLS } from "./decide";

const Draft = z.object({
  refundAskAbove: z.number().nonnegative().nullable(),
  refundMax: z.number().positive(),
  refundPerDay: z.number().positive(),
  invoiceAskAbove: z.number().nonnegative().nullable(),
  invoiceMax: z.number().positive(),
  blockedTools: z.array(z.string()),
  unclear: z.array(z.string()),
});

const SCHEMA = {
  type: "object",
  properties: {
    refundAskAbove: { type: "number", nullable: true, description: "refunds above this need the owner's OK" },
    refundMax: { type: "number", description: "no single refund above this; 200 if the owner says nothing" },
    refundPerDay: { type: "number", description: "total refunds per day; 300 if the owner says nothing" },
    invoiceAskAbove: { type: "number", nullable: true },
    invoiceMax: { type: "number", description: "500 if the owner says nothing" },
    blockedTools: { type: "array", items: { type: "string", enum: Object.keys(TOOLS) } },
    unclear: { type: "array", items: { type: "string" }, description: "rules you could not express, word for word" },
  },
  required: ["refundAskAbove", "refundMax", "refundPerDay", "invoiceAskAbove", "invoiceMax", "blockedTools", "unclear"],
};

const SYSTEM = `You turn a business owner's rules for the AI agents on their PayPal account into strict JSON.
Amounts are in currency units (30 means 30.00), never cents. "Never accept disputes" blocks accept_dispute_claim. "Never delete invoices" blocks delete_invoice.
Anything you cannot express goes in "unclear", word for word. Do not invent rules.`;

const cents = (x: number) => Math.round(x * 100);

export async function compilePolicy(text: string): Promise<{ policy: Policy; unclear: string[] }> {
  const parts = await gemini({ system: SYSTEM, json: SCHEMA, contents: [{ role: "user", parts: [{ text }] }] });
  const d = Draft.parse(JSON.parse(parts.map((p) => p.text ?? "").join("")));
  const policy = Policy.parse({
    currency: "USD",
    refundAskAbove: d.refundAskAbove === null ? null : cents(d.refundAskAbove),
    refundMax: cents(d.refundMax), refundPerDay: cents(d.refundPerDay),
    invoiceAskAbove: d.invoiceAskAbove === null ? null : cents(d.invoiceAskAbove),
    invoiceMax: cents(d.invoiceMax),
    blockedTools: d.blockedTools.filter((t) => t in TOOLS),
  });
  return { policy, unclear: d.unclear };
}

/** Written by code, so the owner confirms what will be enforced and not what a model says it understood. */
export function describePolicy(p: Policy): string[] {
  const m = (x: number) => money(x, p.currency);
  return [
    ...(p.refundAskAbove !== null ? [`Refunds over ${m(p.refundAskAbove)} wait for your OK.`] : []),
    `No refund over ${m(p.refundMax)}, and at most ${m(p.refundPerDay)} a day.`,
    ...(p.invoiceAskAbove !== null ? [`Invoices over ${m(p.invoiceAskAbove)} wait for your OK.`] : []),
    `No invoice over ${m(p.invoiceMax)}.`,
    ...(p.blockedTools.length ? [`Never: ${p.blockedTools.map((t) => t.replaceAll("_", " ")).join(", ")}.`] : []),
    "A refund must match PayPal's own record of the payment and its customer.",
  ];
}
