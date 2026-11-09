export type Action = {
  id: string; at: string; agent: string; tool: string; target: string; customer: string | null; ticketId: string | null;
  amount: string; status: "done" | "pending" | "denied" | "rejected" | "failed"; reasons: string[]; paypalRef: string | null;
};
export type Ticket = { id: string; customer: string; email: string; subject: string; body: string; status: string };
export type FirewallState = { text: string; lines: string[]; frozen: boolean; agentKey: string; phonePath: string; tickets: Ticket[]; actions: Action[] };

export const VERDICT: Record<Action["status"], { label: string; cls: string }> = {
  done: { label: "Allowed", cls: "bg-allow-bg text-allow" },
  pending: { label: "Needs your OK", cls: "bg-ask-bg text-ask" },
  denied: { label: "Blocked", cls: "bg-deny-bg text-deny" },
  rejected: { label: "You said no", cls: "bg-line text-soft" },
  failed: { label: "PayPal refused", cls: "bg-deny-bg text-deny" },
};

export const tool = (name: string) => name.replaceAll("_", " ");

export async function answer(id: string, approve: boolean) {
  await fetch(`/api/firewall/actions/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) });
}
