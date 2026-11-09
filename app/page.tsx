"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Connect, KillSwitch, Rules } from "./ui/firewall/controls";
import { Inbox } from "./ui/firewall/inbox";
import { Ledger } from "./ui/firewall/ledger";
import type { FirewallState } from "./ui/firewall/types";
import { Logo } from "./ui/logo";

const PROOFS = [
  ["Fooled model, safe money", "Leash checks every claim against PayPal's own records, not against what the agent says."],
  ["47 PayPal tools, one door", "The official Agent Toolkit, with money limits and approvals it does not have on its own."],
  ["You stay in charge", "Plain-word rules, one-tap approval on your phone, and a switch that stops every agent."],
];

export default function Home() {
  const [state, setState] = useState<FirewallState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/firewall", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 2500);
    const first = setTimeout(refresh, 0);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [refresh]);

  async function start() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/firewall/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not open the demo.");
    } finally {
      setStarting(false);
    }
  }

  const open = !!state?.tickets.length;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <div className="flex items-center gap-3">
          <Link href="/shop" className="text-sm font-semibold text-leather underline underline-offset-4">Shopping agents</Link>
          <span className="rounded-full border border-line bg-card px-3 py-1 text-xs text-soft">PayPal sandbox · no real money</span>
        </div>
      </header>

      <section className="pt-6 pb-10">
        <h1 className="max-w-4xl font-serif text-5xl leading-[1.02] tracking-tight sm:text-7xl">
          Your AI agent can move your money. <span className="text-leather">One message can hijack it.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-soft">
          Leash is the firewall between AI agents and your PayPal. Agents refund, invoice and spend under rules you write in plain words, and every claim they make is checked against PayPal&apos;s own records.
        </p>
        {!open && state && (
          <div className="mt-7">
            <button onClick={start} disabled={starting} className="rounded-full bg-ink px-7 py-4 text-lg font-semibold text-paper disabled:opacity-60">{starting ? "Creating real sandbox orders…" : "Open the live demo shop"}</button>
            <p className="mt-2 text-sm text-soft">No sign-up. It places three real PayPal sandbox orders for a pretend shop.</p>
            {error && <p className="mt-2 text-deny">{error}</p>}
          </div>
        )}
        {!open && (
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {PROOFS.map(([title, body]) => <li key={title} className="rounded-2xl border border-line bg-card p-5"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-soft">{body}</p></li>)}
          </ul>
        )}
      </section>

      {open && state && (
        <div className="space-y-6">
          <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Inbox state={state} onChange={refresh} />
            <div className="space-y-6">
              <KillSwitch frozen={state.frozen} onChange={refresh} />
              <Rules state={state} onChange={refresh} />
            </div>
          </div>
          <Ledger rows={state.actions} />
          <Connect state={state} />
          <button onClick={start} disabled={starting} className="text-sm font-semibold text-leather underline underline-offset-4">{starting ? "Resetting…" : "Reset the demo"}</button>
        </div>
      )}
    </main>
  );
}
