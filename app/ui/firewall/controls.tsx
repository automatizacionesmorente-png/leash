"use client";

import { ArrowRight, Check } from "lucide-react";
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
    <section id="rules" className="panel scroll-mt-6">
      <h2 className="text-3xl">Your rules, in your words</h2>
      <label className="sr-only" htmlFor="rules-text">Your rules</label>
      <textarea id="rules-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-3 w-full rounded-2xl border border-line bg-paper p-4 text-sm leading-relaxed" />
      <div className="mt-2 flex gap-2">
        {draft
          ? <button onClick={confirm} className="btn btn-gold btn-sm">Enforce exactly this <ArrowRight size={15} strokeWidth={1.75} /></button>
          : <button onClick={read} disabled={busy} className="btn btn-dark btn-sm">{busy ? "Reading…" : "Turn into rules"}</button>}
      </div>
      {error && <p className="mt-2 text-sm text-deny">{error}</p>}
      <p className="mt-5 font-serif text-lg font-medium text-ink">{draft ? "Check before enforcing" : "Enforced in code"}</p>
      <ul className="mt-2 space-y-2 text-sm">{lines.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-gold-soft text-white"><Check size={12} strokeWidth={3} /></span>{l}</li>)}</ul>
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
    <section className={frozen ? "rounded-[22px] bg-deny-bg p-7" : "panel"}>
      <h2 className="text-3xl">{frozen ? "Every agent is stopped" : "Something feels wrong?"}</h2>
      <p className="mt-1 text-sm text-soft">{frozen ? "No agent can read or move anything until you turn this off." : "One tap stops every agent on its very next call."}</p>
      <button onClick={toggle} className={`btn mt-4 ${frozen ? "btn-ghost" : "btn-danger"}`}>{frozen ? "Let agents work again" : "Cut the leash"}</button>
    </section>
  );
}

export function Connect({ state }: { state: FirewallState }) {
  const origin = useSyncExternalStore(() => () => {}, () => location.origin, () => "");
  const [qr, setQr] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toString(location.origin + state.phonePath, { type: "svg", margin: 0, color: { dark: "#14110c", light: "#0000" } }).then(setQr);
  }, [state.phonePath]);
  const config = JSON.stringify({ mcpServers: { paypal: { url: `${origin}/api/paypal-mcp`, headers: { Authorization: `Bearer ${state.agentKey}` } } } }, null, 2);
  async function copy() {
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section id="connect" className="panel grid scroll-mt-6 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0">
        <h2 className="text-3xl">Bring your own agent</h2>
        <p className="mt-1 text-sm text-soft">Claude, ChatGPT, Cursor or your own code. It gets all 47 tools of PayPal&apos;s Agent Toolkit, and every call passes through your rules first. It never holds a PayPal credential.</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-cream p-4 font-mono text-xs text-text">{config.replace(state.agentKey, "lsh_••••••••••••")}</pre>
        <button onClick={copy} className="mt-2 text-sm font-semibold text-leather underline underline-offset-4">{copied ? "Copied" : "Copy MCP config"}</button>
      </div>
      <div className="flex items-center gap-4">
        {showQr
          ? <div className="h-28 w-28 shrink-0" aria-label="QR code to open approvals on your phone" dangerouslySetInnerHTML={{ __html: qr }} />
          : <button onClick={() => setShowQr(true)} className="h-28 w-28 shrink-0 rounded-2xl bg-cream text-sm font-medium text-ink">Show QR code</button>}
        <div>
          <h3 className="text-[1.3rem]">Approve from your phone</h3>
          <p className="text-sm text-soft">Anything waiting for you shows up with one-tap approval. The code signs your phone in, so keep it private.</p>
        </div>
      </div>
    </section>
  );
}
