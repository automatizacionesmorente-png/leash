"use client";

import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { WalletState } from "./types";

export function Setup({ state }: { state: WalletState }) {
  const [qr, setQr] = useState("");
  const origin = useSyncExternalStore(() => () => {}, () => location.origin, () => "");
  const [copied, setCopied] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    QRCode.toString(location.origin + state.phonePath, { type: "svg", margin: 0, color: { dark: "#15130f", light: "#0000" } }).then(setQr);
  }, [state.phonePath]);

  async function link() {
    setLinking(true);
    const res = await fetch("/api/paypal/link", { method: "POST" });
    const data = await res.json();
    if (data.approve) location.href = data.approve;
    else setLinking(false);
  }

  const mcp = JSON.stringify({ mcpServers: { leash: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${state.agentKey}` } } } }, null, 2);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <section className="panel">
      <h2 className="text-3xl">2. Link PayPal, connect agents</h2>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
        <div>
          <p className="font-medium">PayPal</p>
          <p className="text-sm text-soft">{state.paypal.linked ? `Linked${state.paypal.email ? `: ${state.paypal.email}` : ""}` : "One-time approval. Leash then pays only what your rules allow."}</p>
        </div>
        {state.paypal.linked ? (
          <span className="rounded-full bg-allow-bg px-3 py-1 text-sm font-semibold text-allow">Linked</span>
        ) : (
          <button onClick={link} disabled={linking} className="rounded-full bg-[#ffc439] px-4 py-2 font-semibold text-[#111] disabled:opacity-50">
            {linking ? "Opening PayPal…" : "Link PayPal"}
          </button>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-line p-4">
        <p className="font-medium">Any MCP agent</p>
        <p className="text-sm text-soft">Claude, ChatGPT or your own agent gets three tools: read the rules, buy, check a purchase.</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-cream p-4 font-mono text-xs text-text">{mcp}</pre>
        <button onClick={() => copy("mcp", mcp)} className="mt-2 text-sm font-semibold text-leather underline underline-offset-4">
          {copied === "mcp" ? "Copied" : "Copy MCP config"}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line p-4">
        <div className="h-24 w-24 shrink-0" aria-label="QR code to open approvals on your phone" dangerouslySetInnerHTML={{ __html: qr }} />
        <div>
          <p className="font-medium">Approve from your phone</p>
          <p className="text-sm text-soft">Scan to see purchases waiting for you, and approve or reject with one tap.</p>
        </div>
      </div>
    </section>
  );
}
