"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../components/brand";
import { unlockAdtAction } from "./actions";

// PIN gate for an existing ADT account — matches how a customer unlocks a regular project.
// Nothing sensitive is on this screen: just the account code, the customer's first name, and a PIN box.
export default function AdtGate({ adtId, firstName = "" }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();

  const submit = (e) => {
    e?.preventDefault();
    startTx(async () => {
      setErr("");
      const r = await unlockAdtAction(adtId, pin);
      if (r?.error) { setErr(r.error); setPin(""); return; }
      router.refresh();
    });
  };

  return (
    <div className="adtg">
      <style>{CSS}</style>
      <div className="adtg-card">
        <Link href="/" className="adtg-brand"><Wordmark height={24} /></Link>
        <div className="adtg-tag">24/7 Monitoring</div>
        <h1 className="adtg-h">{firstName ? `Welcome back, ${firstName}.` : "Your ADT account"}</h1>
        <p className="adtg-p">Enter the access PIN for <b className="adtg-mono">{adtId}</b> to view your account. It's the last 4 digits of your phone number.</p>
        <form onSubmit={submit} className="adtg-form">
          <input
            className="adtg-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="• • • •"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Access PIN"
            autoFocus
          />
          {err && <div className="adtg-err">{err}</div>}
          <button className="adtg-go" type="submit" disabled={pending || pin.length < 4}>{pending ? "Unlocking…" : "Unlock →"}</button>
        </form>
        <div className="adtg-foot">Not your account? <Link href="/adt">Start a new application</Link></div>
      </div>
    </div>
  );
}

const CSS = `
.adtg{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(1200px 600px at 50% -10%,#12161f,#0b0f19);color:#f4f2ee;font-family:var(--font,'Inter',system-ui,sans-serif)}
.adtg-card{width:100%;max-width:400px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:32px 28px;text-align:center;box-shadow:0 30px 80px -30px rgba(0,0,0,.6)}
.adtg-brand{display:inline-flex;filter:brightness(0) invert(1);opacity:.92;text-decoration:none;margin-bottom:14px}
.adtg-tag{font-size:.66rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#C9A96E;margin-bottom:18px}
.adtg-h{font-family:'Bricolage Grotesque',sans-serif;font-size:1.5rem;font-weight:800;margin:0 0 8px}
.adtg-p{font-size:.9rem;line-height:1.55;color:#b4b1a8;margin:0 auto 22px;max-width:34ch}
.adtg-mono{font-family:ui-monospace,Menlo,Consolas,monospace;color:#f4f2ee;font-weight:700}
.adtg-form{display:flex;flex-direction:column;gap:12px;align-items:center}
.adtg-pin{width:170px;height:60px;text-align:center;font-size:1.8rem;letter-spacing:.4em;font-family:ui-monospace,Menlo,Consolas,monospace;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.28);color:#fff;border-radius:14px;outline:none;padding-left:.4em}
.adtg-pin:focus{border-color:#C9A96E}
.adtg-err{font-size:.84rem;color:#f0a58f;font-weight:600}
.adtg-go{width:170px;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.95rem;font-weight:800;cursor:pointer;font-family:inherit}
.adtg-go:disabled{opacity:.5;cursor:default}
.adtg-foot{margin-top:22px;font-size:.82rem;color:#8b8880}
.adtg-foot a{color:#C9A96E;text-decoration:none;font-weight:700}
`;
