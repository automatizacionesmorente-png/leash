"use client";

import { useState } from "react";
import { PLANTED_INSTRUCTION } from "@/lib/attack";

type Result = { label: string; merchant: string; category: string; amount: string; status: string; reasons: string[] };

const VERDICT: Record<string, { text: string; className: string }> = {
  denied: { text: "Blocked", className: "text-deny" },
  pending: { text: "Waiting for you", className: "text-ask" },
  paid: { text: "Paid", className: "text-allow" },
  failed: { text: "Failed", className: "text-deny" },
};

export function Attack({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch("/api/demo/attack", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The attack could not run.");
    } finally {
      setBusy(false);
      onDone();
    }
  }

  const paid = results.filter((r) => r.status === "paid").length;

  return (
    <section className="panel">
      <h2 className="text-3xl">4. What if the agent gets hacked?</h2>
      <p className="mt-1 text-sm text-soft">A product page plants this instruction, and the agent obeys. This simulates a fully hijacked agent; every attempt goes through the real Leash API.</p>
      <blockquote className="mt-4 rounded-2xl border border-transparent bg-deny-bg/70 p-3 font-mono text-[13px]">{PLANTED_INSTRUCTION}</blockquote>
      <button onClick={run} disabled={busy || !ready} className="btn btn-danger mt-3">
        {busy ? "Attacking…" : "Hijack the agent"}
      </button>
      {!ready && <p className="mt-2 text-sm text-soft">Confirm your rules first.</p>}
      {error && <p className="mt-3 text-deny">{error}</p>}

      {results.length > 0 && (
        <>
          <ol className="mt-5 space-y-3 border-l-2 border-line pl-4">
            {results.map((r) => {
              const verdict = VERDICT[r.status] ?? VERDICT.failed;
              return (
                <li key={r.label} className="arrive text-[15px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">{r.label}</span>
                    <strong className={verdict.className}>{verdict.text}</strong>
                  </div>
                  <p className="text-sm text-soft">{r.amount} at {r.merchant}, labelled “{r.category}”. {r.reasons.join(" ")}</p>
                </li>
              );
            })}
          </ol>
          <p className="arrive mt-4 font-serif text-2xl">{paid === 0 ? "The model was fooled. The code was not." : `${paid} attempt${paid > 1 ? "s" : ""} got through. Tighten your rules.`}</p>
        </>
      )}
    </section>
  );
}
