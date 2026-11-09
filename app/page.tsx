"use client";

import { Cable, Check, Hourglass, Inbox as InboxIcon, ListChecks, ScrollText, ShieldX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Connect, KillSwitch, Rules } from "./ui/firewall/controls";
import { Inbox } from "./ui/firewall/inbox";
import { Landing } from "./ui/firewall/landing";
import { Ledger } from "./ui/firewall/ledger";
import type { FirewallState } from "./ui/firewall/types";
import { Logo } from "./ui/logo";

const RAIL = [
  ["#inbox", InboxIcon, "Support inbox"],
  ["#rules", ScrollText, "Your rules"],
  ["#audit", ListChecks, "Audit log"],
  ["#connect", Cable, "Connect an agent"],
] as const;

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
  if (!open || !state) return <Landing ready={!!state} starting={starting} error={error} onStart={start} />;

  const count = (status: string) => state.actions.filter((a) => a.status === status).length;
  const stats = [
    ["sand", ListChecks, state.actions.length, "Calls recorded"],
    ["sage", Check, count("done"), "Allowed"],
    ["mist", Hourglass, count("pending"), "Waiting for you"],
    ["blush", ShieldX, count("denied"), "Blocked"],
  ] as const;
  return (
    <div className="mx-auto flex max-w-[1320px] gap-6 px-4 pb-20 sm:px-6">
      <nav aria-label="Sections" className="sticky top-6 mt-6 hidden h-fit flex-col items-center gap-2 rounded-[22px] bg-espresso p-2.5 lg:flex">
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center font-serif text-2xl font-semibold text-gold-soft">L</span>
        {RAIL.map(([href, Icon, label]) => <a key={href} href={href} aria-label={label} title={label} className="grid h-11 w-11 place-items-center rounded-xl text-[#ede8dc] hover:bg-[#33291c]"><Icon size={20} strokeWidth={1.75} /></a>)}
      </nav>
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between py-6">
          <span className="lg:hidden"><Logo /></span>
          <h1 className="hidden text-[1.9rem] lg:block">Harbor Ceramics support desk</h1>
          <span className="flex items-center gap-4 text-sm">
            <Link href="/shop" className="hidden text-text hover:text-ink sm:inline">Shopping agents</Link>
            <span className="text-soft">PayPal sandbox · no real money</span>
          </span>
        </header>
        <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(([tint, Icon, value, label]) => (
            <li key={label} className={`tile tile-${tint} flex items-center gap-4 !p-4 !text-left`}>
              <span className="badge shrink-0"><Icon size={22} strokeWidth={1.75} /></span>
              <span><span className="block font-serif text-4xl leading-none font-medium tracking-tight text-ink">{value}</span><span className="text-sm text-soft">{label}</span></span>
            </li>
          ))}
        </ul>
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
          <button onClick={start} disabled={starting} className="btn btn-ghost btn-sm">{starting ? "Resetting…" : "Reset the demo"}</button>
        </div>
      </main>
    </div>
  );
}
