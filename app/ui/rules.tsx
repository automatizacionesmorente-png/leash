"use client";

import { useState } from "react";
import type { Mandate } from "@/lib/rules/types";
import type { WalletState } from "./types";

const EXAMPLE =
  "Up to $60 a week on groceries and $200 a month overall. Never gambling or crypto. Ask me before anything over $30, and before buying from a shop I haven't used.";

export function Rules({ state, onSaved }: { state: WalletState | null; onSaved: () => void }) {
  const [edited, setText] = useState<string | null>(null);
  const text = edited ?? (state?.rulesText || EXAMPLE);
  const [draft, setDraft] = useState<{ mandate: Mandate; summary: string[]; unclear: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function translate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    await fetch("/api/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, mandate: draft.mandate }) });
    setDraft(null);
    setBusy(false);
    onSaved();
  }

  return (
    <section className="panel">
      <h2 className="text-3xl">1. Your rules, in your words</h2>
      <label htmlFor="rules" className="sr-only">Spending rules</label>
      <textarea
        id="rules" value={text} onChange={(e) => setText(e.target.value)} rows={4}
        className="mt-4 w-full resize-y rounded-2xl border border-line bg-paper/50 p-4 text-[15px] leading-relaxed"
      />
      <button onClick={translate} disabled={busy || text.trim().length < 3} className="btn btn-gold mt-3">
        {busy && !draft ? "Reading…" : "Turn into rules"}
      </button>
      {error && <p className="mt-3 text-deny">{error}</p>}

      {draft && (
        <div className="arrive mt-5 rounded-2xl border border-leather/40 bg-paper/60 p-5">
          <p className="text-sm font-semibold">Leash will enforce exactly this:</p>
          <ul className="mt-2 space-y-1">{draft.summary.map((l) => <li key={l}>✓ {l}</li>)}</ul>
          {draft.unclear.length > 0 && (
            <div className="mt-3 rounded-xl bg-ask-bg p-3 text-sm text-ask">
              <p className="font-semibold">Not understood, so not enforced:</p>
              <ul>{draft.unclear.map((u) => <li key={u}>“{u}”</li>)}</ul>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={confirm} disabled={busy} className="btn btn-gold">Confirm rules</button>
            <button onClick={() => setDraft(null)} className="btn btn-ghost">Edit</button>
          </div>
        </div>
      )}

      {!draft && state?.summary.length ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-semibold text-soft">Active rules</p>
          <ul className="mt-2 space-y-1">{state.summary.map((l) => <li key={l}>✓ {l}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}
