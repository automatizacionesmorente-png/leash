"use client";

import { useState } from "react";
import { answer, tool, VERDICT, type Action, type FirewallState, type Ticket } from "./types";

function Card({ ticket, actions, disabled, reply, onRun, onChange }: { ticket: Ticket; actions: Action[]; disabled: boolean; reply?: string; onRun: () => void; onChange: () => void }) {
  const [busy, setBusy] = useState("");
  const attempts = [...actions].reverse().filter((a) => a.tool !== "get_order");
  const stopped = attempts.filter((a) => a.status === "denied").length;
  async function decide(id: string, approve: boolean) {
    setBusy(id);
    await answer(id, approve).finally(() => setBusy(""));
    onChange();
  }
  const [head, poison] = ticket.body.split("\n---\n");
  return (
    <li className="arrive rounded-2xl border border-line bg-paper/60 p-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0">
          <p className="font-semibold">{ticket.subject}</p>
          <p className="text-sm text-soft">{ticket.customer} · {ticket.email}</p>
        </div>
        {ticket.status === "open" && <button onClick={onRun} disabled={disabled} className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50">Let the agent handle it</button>}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{head}</p>
      {poison && <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-deny/30 bg-deny-bg/50 p-3 font-mono text-xs">{poison}</pre>}
      {attempts.length > 0 && (
        <ol className="mt-3 space-y-2 border-l-2 border-line pl-3">
          {attempts.map((a) => (
            <li key={a.id} className="arrive text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-mono">{tool(a.tool)}</span>{a.amount && <span className="text-soft"> · {a.amount}</span>}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[a.status].cls}`}>{VERDICT[a.status].label}</span>
              </div>
              {a.reasons.length > 0 && <p className="text-soft">{a.reasons.join(" ")}</p>}
              {a.paypalRef && <p className="font-mono text-xs text-soft">PayPal {a.paypalRef}{a.confirmed ? " · ✓ confirmed by PayPal" : ""}</p>}
              {a.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => decide(a.id, true)} disabled={busy === a.id} className="rounded-full bg-allow px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                  <button onClick={() => decide(a.id, false)} disabled={busy === a.id} className="rounded-full border border-ink px-4 py-1.5 text-sm font-semibold disabled:opacity-50">Reject</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {stopped >= 2 && <p className="arrive mt-3 font-serif text-2xl">The model was fooled. PayPal&apos;s records were not.</p>}
      {reply && <p className="mt-3 rounded-xl bg-card p-3 text-sm"><span className="font-semibold">Agent&apos;s reply: </span>{reply}</p>}
    </li>
  );
}

export function Inbox({ state, onChange }: { state: FirewallState; onChange: () => void }) {
  const [running, setRunning] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function run(id: string) {
    setRunning(id);
    setError("");
    try {
      const res = await fetch(`/api/firewall/tickets/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReplies((r) => ({ ...r, [id]: data.reply }));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The agent failed.");
    } finally {
      setRunning("");
      onChange();
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-6">
      <h2 className="font-serif text-3xl">The support inbox</h2>
      <p className="mt-1 text-sm text-soft">A real AI agent with real tools, on real PayPal sandbox payments. It is trusting on purpose: one of these messages is poisoned.</p>
      {error && <p className="mt-3 text-deny">{error}</p>}
      {running && <p role="status" className="mt-3 text-sm text-soft">The agent is working…</p>}
      <ul className="mt-4 space-y-3" aria-live="polite">
        {state.tickets.map((t) => <Card key={t.id} ticket={t} actions={state.actions.filter((a) => a.ticketId === t.id)} disabled={!!running || state.frozen} reply={replies[t.id]} onRun={() => run(t.id)} onChange={onChange} />)}
      </ul>
    </section>
  );
}
