"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "../ui/activity";
import { Logo } from "../ui/logo";
import type { WalletState } from "../ui/types";

/** The owner's phone: just what the agents tried, with one-tap approval. */
export default function Approvals() {
  const [state, setState] = useState<WalletState | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/wallet", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 2000);
    const first = setTimeout(refresh, 0);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [refresh]);

  const waiting = state?.purchases.filter((p) => p.status === "pending").length ?? 0;
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <Logo />
      <h1 className="mt-6 font-serif text-4xl leading-tight">{!state ? "Approvals" : waiting ? `${waiting} waiting for you` : "All clear"}</h1>
      <p className="mt-1 text-soft">What your agents tried to buy, decided by your rules.</p>
      <div className="mt-6">{state ? <Activity items={state.purchases} onChange={refresh} big /> : <p className="text-soft">Loading…</p>}</div>
    </main>
  );
}
