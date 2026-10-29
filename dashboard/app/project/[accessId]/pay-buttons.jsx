"use client";
import { useEffect, useState } from "react";

// Online payment button for the customer proposal/portal. Self-contained: asks the server what's payable
// (GET /api/pay/create) and renders nothing unless Square is configured AND there's something due. Clicking
// starts a Square hosted checkout (card / Apple Pay / Google Pay / Cash App); the 5% convenience fee is
// shown here and again as its own line on Square's page.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayButtons({ accessId, svcId }) {
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const qs = svcId ? `svc=${encodeURIComponent(svcId)}` : `project=${encodeURIComponent(accessId)}`;

  useEffect(() => {
    let live = true;
    fetch(`/api/pay/create?${qs}`, { credentials: "same-origin" })
      .then((r) => r.json()).then((d) => { if (live) setQ(d); }).catch(() => {});
    return () => { live = false; };
  }, [qs]);

  if (!q?.configured) return null;
  // Service call → the invoice; proposal → deposit first, then the balance.
  const kind = svcId ? (q.invoice > 0 ? "invoice" : null) : (q.deposit > 0 ? "deposit" : (q.balance > 0 ? "balance" : null));
  if (!kind) return null;
  const amt = kind === "invoice" ? q.invoice : kind === "deposit" ? q.deposit : q.balance;
  const fee = Math.round(amt * ((q.feePct || 5) / 100) * 100) / 100;
  const label = kind === "invoice" ? "Pay Invoice" : kind === "deposit" ? "Pay Deposit" : "Pay Balance";

  async function pay() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/pay/create", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(svcId ? { svcId } : { accessId, kind }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.url) { window.location.href = r.url; return; }   // off to Square's secure checkout
    setBusy(false); setErr(r?.error || "Couldn't start checkout. Try again.");
  }

  return (
    <div className="pcv-pay">
      <button type="button" className="pcv-pay-btn" disabled={busy} onClick={pay}>
        {busy ? "Starting checkout…" : `${label} · ${money(amt + fee)}`}
      </button>
      <span className="pcv-pay-note">Card · Apple&nbsp;Pay · Google&nbsp;Pay — includes a {q.feePct || 5}% convenience fee ({money(fee)})</span>
      {err && <span className="pcv-pay-err">{err}</span>}
      {/* Self-contained styling so the button works in both the proposal view and the service-call panel. */}
      <style>{`
        .pcv-pay{display:flex;flex-direction:column;align-items:center;gap:7px;margin:16px auto 4px;max-width:420px}
        .pcv-pay-btn{width:100%;min-height:48px;padding:10px 18px;border:0;border-radius:12px;background:var(--dv-gold,#C9A96E);color:#1a1205;font-size:1rem;font-weight:800;cursor:pointer;box-shadow:0 6px 18px -8px rgba(201,169,110,.65)}
        .pcv-pay-btn:hover:not(:disabled){filter:brightness(1.04)}
        .pcv-pay-btn:disabled{opacity:.6;cursor:default}
        .pcv-pay-note{font-size:.72rem;color:var(--dv-meta,#787D84);text-align:center}
        .pcv-pay-err{font-size:.78rem;color:#C0392B;font-weight:600}
      `}</style>
    </div>
  );
}
