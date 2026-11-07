"use client";

import { useState } from "react";
import { Badge } from "./badge";
import type { Purchase } from "./types";

export function Activity({ items, onChange, big = false }: { items: Purchase[]; onChange: () => void; big?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    try {
      await fetch(`/api/purchases/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) {
    return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-soft">No purchases yet. Run the demo agent or connect your own.</p>;
  }

  return (
    <ul className="space-y-3" aria-live="polite">
      {items.map((p) => (
        <li key={p.id} className={`arrive rounded-2xl border p-4 ${p.status === "pending" ? "border-ask bg-ask-bg/40" : "border-line bg-paper/40"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{p.description}</p>
              <p className="text-sm text-soft">
                {p.merchant} · {p.category} · by {p.agent} · {new Date(p.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-lg">{p.amount}</span>
              <Badge status={p.status} />
            </div>
          </div>
          {p.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm text-soft">
              {p.reasons.map((r) => <li key={r}>— {r}</li>)}
            </ul>
          )}
          {p.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide(p.id, true)} disabled={busy === p.id}
                className={`rounded-full bg-allow font-semibold text-white disabled:opacity-50 ${big ? "flex-1 py-4 text-lg" : "px-4 py-2"}`}
              >
                Approve &amp; pay
              </button>
              <button
                onClick={() => decide(p.id, false)} disabled={busy === p.id}
                className={`rounded-full border border-ink font-semibold disabled:opacity-50 ${big ? "flex-1 py-4 text-lg" : "px-4 py-2"}`}
              >
                Reject
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
