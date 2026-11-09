"use client";

import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FirewallState } from "./types";

type Draft = { policy: unknown; lines: string[]; unclear: string[] };
const json = { "content-type": "application/json" };

export function Rules({ state, onChange }: { state: FirewallState; onChange: () => void }) {
  const [text, setText] = useState(state.text);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function read() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/firewall/policy", { method: "POST", headers: json, body: JSON.stringify({ text }) });
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
    await fetch("/api/firewall/policy", { method: "PUT", headers: json, body: JSON.stringify({ text, policy: draft!.policy }) });
    setDraft(null);
    onChange();
  }
  const lines = draft?.lines ?? state.lines;
  return (
    <section className="rounded-3xl border border-line bg-card p-6">
      <h2 className="font-serif text-3xl">Your rules, in your words</h2>
      <label className="sr-only" htmlFor="rules">Your rules</label>
      <textarea id="rules" value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-3 w-full rounded-2xl border border-line bg-paper p-3 text-sm" />
      <div className="mt-2 flex gap-2">
        {draft
          ? <button onClick={confirm} className="rounded-full bg-allow px-4 py-2 text-sm font-semibold text-white">Enforce exactly this</button>
          : <button onClick={read} disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50">{busy ? "Reading…" : "Turn into rules"}</button>}
      </div>
      {error && <p className="mt-2 text-sm text-deny">{error}</p>}
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-leather">{draft ? "Check before enforcing" : "Enforced in code"}</p>
      <ul className="mt-2 space-y-1 text-sm">{lines.map((l) => <li key={l}>✓ {l}</li>)}</ul>
      {!!draft?.unclear.length && <p className="mt-2 text-sm text-ask">Not understood, so not enforced: {draft.unclear.join("; ")}</p>}
    </section>
  );
}

export function KillSwitch({ frozen, onChange }: { frozen: boolean; onChange: () => void }) {
  async function toggle() {
    await fetch("/api/firewall/freeze", { method: "POST", headers: json, body: JSON.stringify({ frozen: !frozen }) });
    onChange();
  }
  return (
    <section className={`rounded-3xl border p-6 ${frozen ? "border-deny bg-deny-bg" : "border-line bg-card"}`}>
      <h2 className="font-serif text-3xl">{frozen ? "Every agent is stopped" : "Something feels wrong?"}</h2>
      <p className="mt-1 text-sm text-soft">{frozen ? "No agent can read or move anything until you turn this off." : "One tap stops every agent on its very next call."}</p>
      <button onClick={toggle} className={`mt-3 rounded-full px-5 py-2.5 font-semibold ${frozen ? "border border-ink" : "bg-deny text-paper"}`}>{frozen ? "Let agents work again" : "Cut the leash"}</button>
    </section>
  );
}

export function Connect({ state }: { state: FirewallState }) {
  const origin = useSyncExternalStore(() => () => {}, () => location.origin, () => "");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toString(location.origin + state.phonePath, { type: "svg", margin: 0, color: { dark: "#15130f", light: "#0000" } }).then(setQr);
  }, [state.phonePath]);
  const config = JSON.stringify({ mcpServers: { paypal: { url: `${origin}/api/paypal-mcp`, headers: { Authorization: `Bearer ${state.agentKey}` } } } }, null, 2);
  async function copy() {
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section className="grid gap-6 rounded-3xl border border-line bg-card p-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0">
        <h2 className="font-serif text-3xl">Bring your own agent</h2>
        <p className="mt-1 text-sm text-soft">Claude, ChatGPT, Cursor or your own code. It gets all 47 tools of PayPal&apos;s Agent Toolkit, and every call passes through your rules first. It never holds a PayPal credential.</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-3 font-mono text-xs text-paper">{config}</pre>
        <button onClick={copy} className="mt-2 text-sm font-semibold text-leather underline underline-offset-4">{copied ? "Copied" : "Copy MCP config"}</button>
      </div>
      <div className="flex items-center gap-4">
        <div className="h-28 w-28 shrink-0" aria-label="QR code to open approvals on your phone" dangerouslySetInnerHTML={{ __html: qr }} />
        <div>
          <p className="font-semibold">Approve from your phone</p>
          <p className="text-sm text-soft">Scan it. Anything waiting for you shows up with one-tap approval.</p>
        </div>
      </div>
    </section>
  );
}
