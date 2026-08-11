"use client";

import { useState } from "react";
import AdminShell from "../components/admin-shell";
import LivenessGate from "../components/liveness-gate";

// Test bench: run AWS Face Liveness and show the verdict. Try a live face (should
// pass) then a photo / ID / phone screen (should fail). This proves the AWS
// integration before it goes anywhere near the login flow.
export default function LivenessTestClient({ user, alerts }) {
  const [phase, setPhase] = useState("idle");   // idle | scanning | done
  const [result, setResult] = useState(null);

  const start = () => { setResult(null); setPhase("scanning"); };
  const onPass = (r) => { setResult({ ok: true, ...r }); setPhase("done"); };
  const onFail = (r) => { setResult({ ok: false, ...r }); setPhase("done"); };

  return (
    <AdminShell user={user} alerts={alerts} active="liveness">
      <style>{CSS}</style>
      <div className="apx-wrap">
        <div className="welcome">
          <h1>Liveness <em>Test</em></h1>
          <p className="lt-sub">Certified AWS Face Liveness — the oval + light-flash check. Try your live face (passes), then hold up a photo, ID, or a phone screen (should be rejected). Needs the AWS keys in Development ▸ API Keys.</p>
        </div>

        {phase === "idle" && <button className="lt-btn" onClick={start}>Start liveness check</button>}

        {phase === "scanning" && (
          <div className="lt-stage"><LivenessGate onPass={onPass} onFail={onFail} /></div>
        )}

        {phase === "done" && (
          <div className={`lt-card ${result.ok ? "ok" : "bad"}`}>
            <div className="lt-ic">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {result.ok ? <path d="M20 6 9 17l-5-5" /> : <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></>}
              </svg>
            </div>
            <h2>{result.ok ? "Live person confirmed" : "Not a live person"}</h2>
            {result.confidence != null && <p>Confidence: <b>{Number(result.confidence).toFixed(1)}%</b></p>}
            {!result.ok && result.reason && <p className="lt-reason">{result.reason.replace(/_/g, " ")}</p>}
            <button className="lt-btn ghost" onClick={start}>Test again</button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const CSS = `
.apx .lt-sub{color:var(--muted);font-size:.9rem;margin-top:4px;max-width:72ch;line-height:1.55}
.apx .lt-stage{margin-top:18px}
.apx .lt-btn{margin-top:18px;height:46px;padding:0 24px;border:none;border-radius:12px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-weight:800;font-size:.95rem;font-family:inherit;cursor:pointer}
.apx .lt-btn.ghost{background:#fff;border:1.5px solid var(--line);color:var(--ink)}
.apx .lt-card{margin-top:20px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;max-width:440px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.apx .lt-ic{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;margin-bottom:6px}
.apx .lt-card.ok .lt-ic{background:#eaf6ee;color:#1c8a45}
.apx .lt-card.bad .lt-ic{background:#fbeeec;color:#c0392b}
.apx .lt-card h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;margin:0}
.apx .lt-reason{color:var(--muted);font-size:.85rem;text-transform:capitalize}
`;
