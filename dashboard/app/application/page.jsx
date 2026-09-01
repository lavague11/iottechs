"use client";

import { useState } from "react";
import { Wordmark } from "../components/brand";

// "Track your application" landing. Collects the Application ID + PIN (last 4 of phone), verifies
// via /api/app-pin-check (which mints the iot_app grant cookie), then routes to the status page.
export default function TrackApplicationPage() {
  const [mode, setMode] = useState("email");   // email = email address (default) · id = Application ID
  const [appId, setAppId] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ERRORS = {
    no_app: mode === "email" ? "No application found for that email + PIN. Check them, or start a new application." : "We couldn't find that Application ID. Check it and try again.",
    wrong_pin: "That PIN doesn't match. It's the last 4 digits of your phone.",
    no_pin: "No PIN is set on this application — give us a call and we'll help.",
    too_many: "Too many tries. Please wait a few minutes and try again.",
  };

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const p = pin.trim();
    if (!/^\d{4}$/.test(p)) { setErr("Enter your 4-digit PIN."); return; }
    let body;
    if (mode === "email") {
      const em = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { setErr("Enter a valid email."); return; }
      body = { email: em, pin: p };
    } else {
      const id = appId.trim().toUpperCase();
      if (!id) { setErr("Enter your Application ID."); return; }
      body = { appId: id, pin: p };
    }
    setBusy(true);
    try {
      const res = await fetch("/api/app-pin-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.ok) { window.location.assign(`/application/${j.appId}`); return; }
      setErr(ERRORS[j.error] || j.error || "Couldn't look that up. Try again.");
      setBusy(false);
    } catch (_) { setErr("Connection error. Please try again."); setBusy(false); }
  }

  function google(e) {
    e.preventDefault();
    window.location.href = "/api/auth/google?ctx=apply";
  }

  return (
    <div className="tr-root">
      <style>{CSS}</style>
      <a href="/go" className="tr-home" aria-label="IOT TECHS home"><Wordmark height={26} /></a>
      <div className="tr-card">
        <div className="tr-ic">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </div>
        <h1>Track your application</h1>

        <form onSubmit={submit}>
          {mode === "email" ? (
            <>
              <div className="tr-lblrow">
                <label className="tr-lbl" htmlFor="tr-email">Email</label>
                <button type="button" className="tr-swap" onClick={() => { setMode("id"); setErr(""); }}>Use Application ID</button>
              </div>
              <input id="tr-email" className="tr-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com" autoComplete="email" spellCheck={false} />
            </>
          ) : (
            <>
              <div className="tr-lblrow">
                <label className="tr-lbl" htmlFor="tr-id">Application ID</label>
                <button type="button" className="tr-swap" onClick={() => { setMode("email"); setErr(""); }}>Use email instead</button>
              </div>
              <input id="tr-id" className="tr-in mono" value={appId} onChange={(e) => setAppId(e.target.value.toUpperCase())}
                placeholder="APP0000" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            </>
          )}

          <label className="tr-lbl" htmlFor="tr-pin">PIN <span className="tr-hint">(last 4 digits of your phone)</span></label>
          <input id="tr-pin" className="tr-in mono" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••" inputMode="numeric" autoComplete="off" maxLength={4} />

          {err && <div className="tr-err">{err}</div>}
          <button className="tr-btn" type="submit" disabled={busy}>{busy ? "Looking…" : "View my application →"}</button>
        </form>

        <div className="tr-or"><span>or</span></div>
        <a className="tr-google" href="/api/auth/google?ctx=apply" onClick={google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </a>

        <p className="tr-foot">Haven&rsquo;t applied yet? <a href="/apply">Start an application →</a></p>
      </div>
    </div>
  );
}

const CSS = `
/* Deck design system: Instrument Sans (--font-sans) + JetBrains Mono (--font-mono), both loaded
   globally; warm-paper palette, soft gold. Matches /apply and the candidate portals. */
.tr-root{--ink:#101418;--ink-soft:#3A4048;--muted:#787D84;--faint:#A6ABB1;--line:#E4E4DF;--line-soft:#EDEDE9;
  --soft:#F4F4F2;--raise:#FBFBFA;--gold:#C9A96E;--gold-hi:#E8CB94;--gold-deep:#A8842F;
  min-height:100vh;background:radial-gradient(900px 460px at 50% -12%,rgba(201,169,110,.12),transparent 62%),var(--soft);color:var(--ink);
  font-family:var(--font-sans),'Instrument Sans',ui-sans-serif,system-ui,sans-serif;line-height:1.55;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:26px 18px}
.tr-home{display:inline-flex;color:var(--ink)}
.tr-card{width:100%;max-width:430px;background:var(--raise);border:1px solid var(--line);border-radius:16px;padding:32px 30px;
  box-shadow:0 1px 2px rgba(16,20,24,.04),0 26px 60px -32px rgba(16,20,24,.3);text-align:center}
.tr-ic{width:56px;height:56px;margin:0 auto 16px;border-radius:15px;display:grid;place-items:center;
  background:#F3ECDD;border:1px solid rgba(201,169,110,.4);color:var(--gold-deep)}
.tr-card h1{font-family:var(--font-sans),'Instrument Sans',sans-serif;font-weight:800;letter-spacing:-.024em;font-size:1.5rem;margin:0 0 6px;color:var(--ink)}
.tr-sub{color:var(--muted);font-size:.92rem;margin:0 0 22px}
.tr-lbl{display:block;text-align:left;font-weight:700;font-size:.8rem;color:var(--ink-soft);margin:16px 0 7px}
.tr-lblrow{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.tr-swap{background:none;border:none;padding:0;font:inherit;font-size:.76rem;font-weight:700;color:var(--gold-deep);cursor:pointer}
.tr-swap:hover{text-decoration:underline}
.tr-hint{font-weight:500;color:var(--muted)}
.tr-or{display:flex;align-items:center;gap:12px;margin:18px 0;color:var(--faint);font-size:.78rem}
.tr-or::before,.tr-or::after{content:"";flex:1;height:1px;background:var(--line)}
.tr-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 16px;font:inherit;font-size:.92rem;font-weight:700;color:var(--ink);text-decoration:none;transition:border-color .14s,box-shadow .14s}
.tr-google:hover{border-color:var(--gold-deep);box-shadow:0 5px 16px -9px rgba(16,20,24,.3)}
.tr-google svg{flex:none}
.tr-in{width:100%;padding:13px 15px;border:1px solid var(--line);border-radius:11px;font-size:1rem;font-family:inherit;
  background:var(--soft);color:var(--ink);outline:none;transition:border-color .15s,background .15s,box-shadow .15s;letter-spacing:.06em}
.tr-in:focus{border-color:var(--gold);background:#fff;box-shadow:0 0 0 3px rgba(201,169,110,.14)}
.tr-in.mono{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace}
.tr-err{margin-top:14px;text-align:left;color:#C4553D;background:#F6E7E2;border:1px solid transparent;border-radius:10px;padding:10px 13px;font-size:.86rem;font-weight:600}
.tr-btn{width:100%;margin-top:20px;padding:15px 22px;border:none;border-radius:12px;font-weight:800;font-size:.96rem;font-family:inherit;cursor:pointer;
  background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:var(--ink);transition:transform .15s,box-shadow .2s}
.tr-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 30px -12px rgba(176,143,79,.7)}
.tr-btn:disabled{opacity:.6;cursor:default}
.tr-foot{margin:20px 0 0;font-size:.86rem;color:var(--muted)}
.tr-foot a{color:var(--gold-deep);font-weight:700;text-decoration:none}
.tr-foot a:hover{text-decoration:underline}
`;
