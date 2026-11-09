"use client";

import { useState } from "react";

type Step = { kind: "tool"; name: string; args: Record<string, unknown>; result: { status?: string } | null } | { kind: "say"; text: string };

const TASKS = [
  "Buy this week's groceries: a veggie box, oat milk and coffee. Also a 65W USB-C charger.",
  "Put $50 on LuckyBet and buy $100 of Bitcoin.",
  "Get me the noise-cancelling headphones.",
];

export function DemoAgent({ ready, linked, onDone }: { ready: boolean; linked: boolean; onDone: () => void }) {
  const [task, setTask] = useState(TASKS[0]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setSteps([]);
    try {
      const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSteps(data.steps);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The agent failed.");
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <section className="panel">
      <h2 className="text-3xl">3. Send a shopping agent</h2>
      <p className="mt-1 text-sm text-soft">An AI agent with a small marketplace and your PayPal, through Leash. It can only spend what your rules allow.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {TASKS.map((t) => (
          <button key={t} onClick={() => setTask(t)} className={`rounded-full border px-3 py-1.5 text-left text-sm ${t === task ? "border-leather bg-leather/10" : "border-line"}`}>
            {t.length > 48 ? `${t.slice(0, 48)}…` : t}
          </button>
        ))}
      </div>
      <label htmlFor="task" className="sr-only">Task for the agent</label>
      <textarea id="task" value={task} onChange={(e) => setTask(e.target.value)} rows={2} className="mt-3 w-full rounded-2xl border border-line bg-paper/50 p-3" />
      <button onClick={run} disabled={busy || !ready} className="btn btn-gold mt-3">
        {busy ? "Agent is shopping…" : "Run agent"}
      </button>
      {!ready && <p className="mt-2 text-sm text-soft">Confirm your rules first.</p>}
      {ready && !linked && <p className="mt-2 text-sm text-soft">Link PayPal (step 2) so allowed purchases can actually be paid.</p>}
      {error && <p className="mt-3 text-deny">{error}</p>}

      {steps.length > 0 && (
        <ol className="mt-5 space-y-2 border-l-2 border-line pl-4">
          {steps.map((s, i) =>
            s.kind === "say" ? (
              <li key={i} className="arrive whitespace-pre-wrap rounded-xl bg-paper/70 p-3 text-[15px]">{s.text}</li>
            ) : (
              <li key={i} className="arrive font-mono text-[13px] text-soft">
                <span className="text-ink">{s.name}</span>
                {s.name === "buy" ? ` ${String(s.args.description ?? "")} → ` : " "}
                {s.name === "buy" && <strong className={s.result?.status === "paid" ? "text-allow" : s.result?.status === "pending" ? "text-ask" : "text-deny"}>{String(s.result?.status ?? "error")}</strong>}
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}
