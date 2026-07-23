"use client";

import { useState } from "react";
import { Wordmark } from "../../components/brand";

// PIN gate for the customer service-call tracker. The Service Call ID is already in the URL, so we
// only collect the PIN; a valid PIN mints the scoped cookie and we reload into the tracker.
export default function SvcGate({ svcId, customerName }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!pin.trim()) { setErr("Enter your PIN."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/svc-pin-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svcId, pin }),
      });
      const j = await res.json();
      if (j.ok) { window.location.reload(); return; }
      setErr(j.error === "wrong_pin" ? "That PIN doesn't match. Try again." : j.error === "no_pin" ? "This call has no PIN on file — call us and we'll help." : "Couldn't verify. Please try again.");
      setBusy(false);
    } catch (_) { setErr("Connection error. Please try again."); setBusy(false); }
  }

  const first = (customerName || "").trim().split(/\s+/)[0];

  return (
    <div className="sg-root">
      <a href="/" className="sg-brand" aria-label="IOT TECHS home"><Wordmark height={26} /></a>
      <form className="sg-card" onSubmit={submit}>
        <div className="sg-lock">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </div>
        <div className="sg-tag">Service Call</div>
        <h1>{first ? `Welcome back, ${first}.` : "Track your service call."}</h1>
        <p className="sg-sub">Enter the PIN for <span className="mono">{svcId}</span> to see its progress. Your PIN is the last 4 digits of your phone.</p>
        <input className="sg-input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric" autoComplete="off" placeholder="••••" aria-label="PIN" autoFocus />
        {err && <div className="sg-err">{err}</div>}
        <button className="sg-btn" type="submit" disabled={busy}>{busy ? "Checking…" : "View my service call →"}</button>
        <a className="sg-alt" href="/report-issue">Not your call? Report a new issue</a>
      </form>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.sg-root{--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--bg-soft:#f6f7f9;
  min-height:100vh;background:radial-gradient(1000px 460px at 50% -10%,#f0f2f7 0%,#fff 60%);color:var(--ink);
  font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding:34px 20px}
.sg-brand{display:inline-flex;margin-bottom:26px}
.sg-card{width:100%;max-width:420px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:32px 28px;text-align:center;box-shadow:0 24px 60px -30px rgba(14,19,32,.28)}
.sg-lock{width:56px;height:56px;border-radius:50%;background:#f8f0e0;display:grid;place-items:center;margin:0 auto 16px}
.sg-lock svg{width:26px;height:26px;fill:none;stroke:var(--gold-deep);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sg-tag{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);background:#f8f0e0;padding:5px 12px;border-radius:20px;margin-bottom:12px}
.sg-card h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.5rem;margin:0 0 6px}
.sg-sub{color:var(--muted);font-size:.92rem;margin:0 0 20px}
.sg-input{width:100%;padding:15px;border:1.5px solid var(--line);border-radius:12px;font-family:'Hanken Grotesk',sans-serif;
  font-size:1.5rem;font-weight:800;text-align:center;letter-spacing:.4em;background:var(--bg-soft);color:var(--ink)}
.sg-input:focus{outline:none;border-color:var(--gold);background:#fff}
.sg-err{margin-top:14px;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:10px;padding:10px 13px;font-size:.87rem;font-weight:600}
.sg-btn{width:100%;margin-top:16px;padding:15px;border:none;border-radius:12px;background:var(--gold);color:var(--ink);font-weight:800;font-size:.98rem;font-family:inherit;cursor:pointer;transition:transform .15s,background .2s,box-shadow .2s}
.sg-btn:hover{transform:translateY(-2px);background:var(--gold-deep);color:#fff;box-shadow:0 14px 28px -12px rgba(176,143,79,.6)}
.sg-btn:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none;background:var(--gold)}
.sg-alt{display:inline-block;margin-top:16px;color:var(--muted);font-size:.84rem;text-decoration:none;font-weight:600}
.sg-alt:hover{color:var(--ink);text-decoration:underline}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px;font-weight:700}
`;
