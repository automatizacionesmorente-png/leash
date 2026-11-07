import type { Mandate } from "@/lib/rules/types";

export type Purchase = {
  id: string; agent: string; merchant: string; category: string; description: string;
  amount: string; cents: number; status: "paid" | "pending" | "denied" | "rejected" | "failed"; at: string; reasons: string[];
};

export type WalletState = {
  rulesText: string;
  mandate: Mandate | null;
  summary: string[];
  paypal: { linked: boolean; email?: string | null };
  agentKey: string;
  phonePath: string;
  purchases: Purchase[];
};
