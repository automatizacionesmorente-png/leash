"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity } from "../ui/activity";
import { Attack } from "../ui/attack";
import { DemoAgent } from "../ui/demo-agent";
import { Logo } from "../ui/logo";
import { Rules } from "../ui/rules";
import { Setup } from "../ui/setup";
import type { WalletState } from "../ui/types";

export default function Shop() {
  const [state, setState] = useState<WalletState | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setState(await res.json());
      setError("");
    } catch {
      setError("Can't reach Leash right now. Retrying…");
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 2000);
    const first = setTimeout(refresh, 0);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [refresh]);

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <Link href="/" className="btn btn-ghost btn-sm">Back to the firewall</Link>
      </header>

      <section className="pt-6 pb-10">
        <h1 className="max-w-3xl text-[2.6rem] sm:text-[3.6rem]">
          Let AI agents shop. On your terms.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-soft">
          Write your spending rules in plain words. Leash turns them into rules in code, and any agent can
          pay with your PayPal only through them: allowed purchases go through, risky ones wait for your OK,
          and the rest are blocked.
        </p>
      </section>

      {error && <p role="status" className="mb-4 rounded-xl bg-deny-bg px-4 py-3 text-deny">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <Rules state={state} onSaved={refresh} />
          <DemoAgent ready={!!state?.mandate} linked={!!state?.paypal.linked} onDone={refresh} />
          <Attack ready={!!state?.mandate} onDone={refresh} />
        </div>
        <div className="space-y-6">
          <section className="panel">
            <h2 className="text-3xl">Live wallet</h2>
            <p className="mt-1 text-sm text-soft">Every purchase any agent tries, decided by your rules.</p>
            <div className="mt-5">{state ? <Activity items={state.purchases} onChange={refresh} /> : <p className="text-soft">Loading…</p>}</div>
          </section>
          {state && <Setup state={state} />}
        </div>
      </div>
    </main>
  );
}
