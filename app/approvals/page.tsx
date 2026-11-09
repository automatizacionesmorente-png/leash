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
      <h1 className="mt-6 text-[2.6rem]">{!state ? "Approvals" : waiting ? `${waiting} waiting for you` : "All clear"}</h1>
      <p className="mt-1 text-soft">What your agents tried to do, decided by your rules.</p>
      <ul className="mt-6 space-y-3">
        {actions.map((a) => (
          <li key={a.id} className="arrive tile tile-sand !p-5 !text-left">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-[1.35rem] first-letter:uppercase">{tool(a.tool)}</h2><p className="text-sm text-soft">{a.customer ?? a.target} · by {a.agent}</p></div>
              <span className="font-serif text-3xl font-medium tracking-tight text-ink">{a.amount}</span>
            </div>
            <ul className="mt-2 text-sm text-soft">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="mt-3 flex gap-2">
              <button onClick={() => answer(a.id, true).then(refresh)} className="btn btn-gold btn-lg flex-1">Approve</button>
              <button onClick={() => answer(a.id, false).then(refresh)} className="btn btn-ghost btn-lg flex-1">Reject</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6">{!state ? <p className="text-soft">Loading…</p> : (state.purchases.length > 0 || !actions.length) && <Activity items={state.purchases} onChange={refresh} big />}</div>
    </main>
  );
}
