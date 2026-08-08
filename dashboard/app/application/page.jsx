"use client";

import { useState } from "react";
import { Wordmark } from "../components/brand";

// "Track your application" landing. Collects the Application ID + PIN (last 4 of phone), verifies
// via /api/app-pin-check (which mints the iot_app grant cookie), then routes to the status page.
export default function TrackApplicationPage() {
  const [appId, setAppId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ERRORS = {
    no_app: "We couldn't find that Application ID. Check it and try again.",
    wrong_pin: "That PIN doesn't match. It's the last 4 digits of your phone.",
    no_pin: "No PIN is set on this application — give us a call and we'll help.",
    too_many: "Too many tries. Please wait a few minutes and try again.",
  };

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const id = document.getElementById("tr-id")?.value?.trim().toUpperCase() || appId.trim().toUpperCase();
    const p = document.getElementById("tr-pin")?.value?.trim() || pin.trim();
    if (!id) { setErr("Enter your Application ID."); return; }
    if (!/^\d{4}$/.test(p)) { setErr("Enter your 4-digit PIN."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/app-pin-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: id, pin: p }),
      });
      const j = await res.json();
      if (j.ok) { window.location.assign(`/application/${j.appId}`); return; }
      setErr(ERRORS[j.error] || j.error || "Couldn't look that up. Try again.");
      setBusy(false);
    } catch (_) { setErr("Connection error. Please try again."); setBusy(false); }
  }

  return (
    <div className="tr-root">
      <style>{CSS}</style>
      <a href="/" className="tr-home" aria-label="IOT TECHS home"><Wordmark height={26} /></a>
      <div className="tr-card">
        <div className="tr-ic">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </div>
        <h1>Track your application</h1>
        <p className="tr-sub">Enter your Application ID and PIN to see where things stand.</p>

        <form onSubmit={submit}>
          <label className="tr-lbl" htmlFor="tr-id">Application ID</label>
          <input id="tr-id" className="tr-in mono" value={appId} onChange={(e) => setAppId(e.target.value.toUpperCase())}
            placeholder="APP0000" autoCapitalize="characters" autoComplete="off" spellCheck={false} />

          <label className="tr-lbl" htmlFor="tr-pin">PIN <span className="tr-hint">(last 4 digits of your phone)</span></label>
          <input id="tr-pin" className="tr-in mono" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••" inputMode="numeric" autoComplete="off" maxLength={4} />

          {err && <div className="tr-err">{err}</div>}
          <button className="tr-btn" type="submit" disabled={busy}>{busy ? "Looking…" : "View my application →"}</button>
        </form>

        <p className="tr-foot">Haven&rsquo;t applied yet? <a href="/apply">Start an application →</a></p>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap');
.tr-root{--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--soft:#f5f6f9;--gold:#C9A96E;--gold-hi:#E8CB94;--gold-deep:#b08f4f;
  min-height:100vh;background:radial-gradient(1100px 500px at 50% -10%,#f0f2f7 0%,#eceef3 60%);color:var(--ink);
  font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:26px 18px}
.tr-home{display:inline-flex}
.tr-card{width:100%;max-width:420px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:32px 30px;
  box-shadow:0 40px 90px -44px rgba(14,19,32,.5);text-align:center}
.tr-ic{width:56px;height:56px;margin:0 auto 16px;border-radius:15px;display:grid;place-items:center;
  background:#fdfaf2;border:1px solid #eeddb9;color:var(--gold-deep)}
.tr-card h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.01em;font-size:1.5rem;margin:0 0 6px}
.tr-sub{color:var(--muted);font-size:.92rem;margin:0 0 22px}
.tr-lbl{display:block;text-align:left;font-weight:700;font-size:.8rem;color:#2a3040;margin:14px 0 7px}
.tr-hint{font-weight:500;color:var(--muted)}
.tr-in{width:100%;padding:13px 15px;border:1.5px solid var(--line);border-radius:12px;font-size:1rem;font-family:inherit;
  background:var(--soft);color:var(--ink);outline:none;transition:border-color .15s,background .15s,box-shadow .15s;letter-spacing:.06em}
.tr-in:focus{border-color:var(--gold);background:#fff;box-shadow:0 0 0 3px rgba(201,169,110,.14)}
.tr-in.mono{font-family:Menlo,Consolas,monospace}
.tr-err{margin-top:14px;text-align:left;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:11px;padding:10px 13px;font-size:.86rem;font-weight:600}
.tr-btn{width:100%;margin-top:20px;padding:15px 22px;border:none;border-radius:12px;font-weight:800;font-size:.96rem;font-family:inherit;cursor:pointer;
  background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:#0e1320;transition:transform .15s,box-shadow .2s}
.tr-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 30px -12px rgba(176,143,79,.7)}
.tr-btn:disabled{opacity:.6;cursor:default}
.tr-foot{margin:20px 0 0;font-size:.86rem;color:var(--muted)}
.tr-foot a{color:var(--gold-deep);font-weight:700;text-decoration:none}
.tr-foot a:hover{text-decoration:underline}
`;
