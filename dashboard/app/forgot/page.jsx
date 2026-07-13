"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPasswordAction } from "./actions";

export default function ForgotPage() {
  const [f, setF] = useState({ identifier: "", last4: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTx] = useTransition();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function submit(e) {
    e.preventDefault();
    setErr("");
    if (f.password !== f.confirm) { setErr("Passwords don't match."); return; }
    if (f.password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    startTx(async () => {
      const r = await resetPasswordAction(f);
      if (r?.error) setErr(r.error); else setDone(true);
    });
  }

  return (
    <div className="fp-root">
      <div className="fp-card">
        <div className="fp-brand">IOT <b>TECHS</b></div>

        {done ? (
          <div className="fp-done">
            <div className="fp-check"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#1c8a45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
            <h1>Password updated</h1>
            <p>You can sign in with your new password now — by email, phone, or username.</p>
            <Link href="/login" className="fp-btn">Sign in →</Link>
          </div>
        ) : (
          <>
            <h1 className="fp-title">Reset your password</h1>
            <p className="fp-sub">Enter your account and confirm it&apos;s you with the last 4 digits of your phone.</p>
            <form className="fp-form" onSubmit={submit}>
              <label className="fp-field"><span>Email or phone</span>
                <input className="fp-input" value={f.identifier} onChange={(e) => set("identifier", e.target.value)} placeholder="you@email.com or (555) 123-4567" autoComplete="username" required />
              </label>
              <label className="fp-field"><span>Last 4 of your phone</span>
                <input className="fp-input" value={f.last4} onChange={(e) => set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="••••" required />
              </label>
              <label className="fp-field"><span>New password</span>
                <input className="fp-input" type="password" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" required minLength={6} />
              </label>
              <label className="fp-field"><span>Confirm password</span>
                <input className="fp-input" type="password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="Re-enter password" autoComplete="new-password" required />
              </label>
              {err && <div className="fp-err">{err}</div>}
              <button className="fp-btn" type="submit" disabled={pending}>{pending ? "Updating…" : "Update password"}</button>
            </form>
            <Link href="/login" className="fp-back">← Back to sign in</Link>
          </>
        )}
      </div>

      <style>{`
        .fp-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
          background:radial-gradient(1000px 600px at 50% -10%,#16203a 0%,#0B0F1A 60%,#070a12 100%);font-family:'Bricolage Grotesque',system-ui,sans-serif}
        .fp-card{background:#12182a;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:30px 30px 26px;max-width:400px;width:100%;box-shadow:0 30px 70px -20px rgba(0,0,0,.6)}
        .fp-brand{font-weight:800;font-size:1.15rem;letter-spacing:.02em;color:#fff;text-align:center;margin-bottom:22px}
        .fp-brand b{color:#C9A96E}
        .fp-title{color:#fff;font-size:1.3rem;font-weight:800;margin-bottom:6px}
        .fp-sub{color:#9aa5bd;font-size:.86rem;line-height:1.5;margin-bottom:20px}
        .fp-form{display:flex;flex-direction:column;gap:13px}
        .fp-field{display:flex;flex-direction:column;gap:5px}
        .fp-field span{font-size:.78rem;font-weight:700;color:#c3ccdd}
        .fp-input{height:44px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#0d1322;color:#fff;padding:0 13px;font-size:.92rem;font-family:inherit;outline:none;transition:border-color .15s}
        .fp-input:focus{border-color:#C9A96E}
        .fp-err{background:rgba(210,60,60,.12);border:1px solid rgba(210,60,60,.4);color:#f2a3a3;font-size:.82rem;padding:9px 12px;border-radius:9px}
        .fp-btn{display:inline-flex;align-items:center;justify-content:center;height:46px;margin-top:4px;background:#C9A96E;color:#0B0F1A;font-weight:800;font-size:.96rem;border:none;border-radius:12px;cursor:pointer;text-decoration:none;transition:background .15s}
        .fp-btn:hover:not(:disabled){background:#d8bd88}
        .fp-btn:disabled{opacity:.6;cursor:default}
        .fp-back{display:block;text-align:center;margin-top:16px;color:#7d879c;font-size:.82rem;text-decoration:none}
        .fp-back:hover{color:#c3ccdd}
        .fp-done{text-align:center}
        .fp-check{width:56px;height:56px;border-radius:50%;background:rgba(28,138,69,.14);display:grid;place-items:center;margin:6px auto 16px}
        .fp-done h1{color:#fff;font-size:1.3rem;font-weight:800;margin-bottom:8px}
        .fp-done p{color:#9aa5bd;font-size:.88rem;line-height:1.5;margin-bottom:22px}
      `}</style>
    </div>
  );
}
