"use client";
import { useEffect, useState } from "react";

// Online payment button for the customer proposal/portal. Self-contained: asks the server what's payable
// (GET /api/pay/create) and renders nothing unless Square is configured AND there's something due. Clicking
// starts a Square hosted checkout (card / Apple Pay / Google Pay / Cash App); the 5% convenience fee is
// shown here and again as its own line on Square's page.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayButtons({ accessId }) {
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/pay/create?project=${encodeURIComponent(accessId)}`, { credentials: "same-origin" })
      .then((r) => r.json()).then((d) => { if (live) setQ(d); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  if (!q?.configured) return null;
  const kind = q.deposit > 0 ? "deposit" : (q.balance > 0 ? "balance" : null);   // deposit first, then the balance
  if (!kind) return null;
  const amt = kind === "deposit" ? q.deposit : q.balance;
  const fee = Math.round(amt * ((q.feePct || 5) / 100) * 100) / 100;

  async function pay() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/pay/create", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ accessId, kind }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.url) { window.location.href = r.url; return; }   // off to Square's secure checkout
    setBusy(false); setErr(r?.error || "Couldn't start checkout. Try again.");
  }

  return (
    <div className="pcv-pay">
      <button type="button" className="pcv-pay-btn" disabled={busy} onClick={pay}>
        {busy ? "Starting checkout…" : `Pay ${kind === "deposit" ? "Deposit" : "Balance"} · ${money(amt + fee)}`}
      </button>
      <span className="pcv-pay-note">Card · Apple&nbsp;Pay · Google&nbsp;Pay — includes a {q.feePct || 5}% convenience fee ({money(fee)})</span>
      {err && <span className="pcv-pay-err">{err}</span>}
    </div>
  );
}
