"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "../ui/activity";
import { Logo } from "../ui/logo";
import type { WalletState } from "../ui/types";
import { answer, tool, type Action } from "../ui/firewall/types";

/** The owner's phone: just what the agents tried, with one-tap approval. */
export default function Approvals() {
  const [state, setState] = useState<WalletState | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/wallet", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState(await res.json());
    const fw = await fetch("/api/firewall", { cache: "no-store" }).catch(() => null);
    if (fw?.ok) setActions((await fw.json()).actions.filter((x: Action) => x.status === "pending"));
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 2000);
    const first = setTimeout(refresh, 0);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [refresh]);

  const waiting = (state?.purchases.filter((p) => p.status === "pending").length ?? 0) + actions.length;
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <Logo />
      <h1 className="mt-6 font-serif text-4xl leading-tight">{!state ? "Approvals" : waiting ? `${waiting} waiting for you` : "All clear"}</h1>
      <p className="mt-1 text-soft">What your agents tried to do, decided by your rules.</p>
      <ul className="mt-6 space-y-3">
        {actions.map((a) => (
          <li key={a.id} className="arrive rounded-2xl border border-ask bg-ask-bg/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-medium capitalize">{tool(a.tool)}</p><p className="text-sm text-soft">{a.customer ?? a.target} · by {a.agent}</p></div>
              <span className="font-mono text-lg">{a.amount}</span>
            </div>
            <ul className="mt-2 text-sm text-soft">{a.reasons.map((r) => <li key={r}>— {r}</li>)}</ul>
            <div className="mt-3 flex gap-2">
              <button onClick={() => answer(a.id, true).then(refresh)} className="flex-1 rounded-full bg-allow py-4 text-lg font-semibold text-white">Approve</button>
              <button onClick={() => answer(a.id, false).then(refresh)} className="flex-1 rounded-full border border-ink py-4 text-lg font-semibold">Reject</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6">{!state ? <p className="text-soft">Loading…</p> : (state.purchases.length > 0 || !actions.length) && <Activity items={state.purchases} onChange={refresh} big />}</div>
    </main>
  );
}
