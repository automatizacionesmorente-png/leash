import type { Purchase } from "./types";

const STYLE: Record<Purchase["status"], { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-allow-bg text-allow" },
  pending: { label: "Needs your OK", cls: "bg-ask-bg text-ask" },
  denied: { label: "Blocked", cls: "bg-deny-bg text-deny" },
  rejected: { label: "You said no", cls: "bg-line text-soft" },
  failed: { label: "Payment failed", cls: "bg-deny-bg text-deny" },
};

export function Badge({ status }: { status: Purchase["status"] }) {
  const s = STYLE[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}
