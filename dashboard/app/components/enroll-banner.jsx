"use client";

import { useEffect, useState } from "react";

// "Set up Face ID" nudge for internal users who haven't verified yet. Fetches
// the user's own status on mount; shows only for internal + not-verified. Dismissing
// it SNOOZES the nudge for ~3 weeks (persisted), so it doesn't nag every session. Links to /enroll.
const SNOOZE_MS = 21 * 24 * 60 * 60 * 1000;   // ~3 weeks — between the "two weeks or a month" ask

export default function EnrollBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const at = Number(localStorage.getItem("iot_faceid_snoozed_at") || 0);
      if (at && Date.now() - at < SNOOZE_MS) return;   // still within the snooze window
    } catch {}
    let alive = true;
    fetch("/api/my-identity")
      .then((r) => r.json())
      .then((j) => { if (alive && j.internal && j.status !== "verified") setShow(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  return (
    <div className="apx-wrap" style={{ paddingTop: 16, paddingBottom: 0 }}>
      <div className="efb">
      <style>{CSS}</style>
      <span className="efb-ic">
        <svg viewBox="0 0 100 100" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 26 V16 Q8 8 16 8 H26" /><path d="M74 8 H84 Q92 8 92 16 V26" />
          <path d="M92 74 V84 Q92 92 84 92 H74" /><path d="M26 92 H16 Q8 92 8 84 V74" />
          <path d="M50 46 V58 Q50 61 47 61" fill="none" /><path d="M38 68 Q50 78 62 68" />
        </svg>
      </span>
      <div className="efb-txt">
        <b>Secure your account with Face ID.</b>
        <span>Verify your identity once with your ID and a face scan — then sign in with your face.</span>
      </div>
      <a className="efb-cta" href="/enroll">Set up →</a>
      <button className="efb-x" aria-label="Dismiss for now" title="Not now — ask me again in a few weeks" onClick={() => { try { localStorage.setItem("iot_faceid_snoozed_at", String(Date.now())); } catch {} setShow(false); }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      </div>
    </div>
  );
}

const CSS = `
.efb{display:flex;align-items:center;gap:13px;padding:11px 16px;margin:0 0 16px;border-radius:12px;
  background:linear-gradient(100deg,#fdf7ea,#fbf1dc);border:1px solid #eeddb9;color:#5b4a24}
.efb-ic{flex:0 0 auto;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;
  background:#fff;border:1px solid #eeddb9;color:#b08f4f}
.efb-txt{display:flex;flex-direction:column;gap:1px;min-width:0;line-height:1.35}
.efb-txt b{font-size:.9rem;font-weight:800;color:#4a3c1c}
.efb-txt span{font-size:.8rem;color:#7a6636}
.efb-cta{margin-left:auto;flex:0 0 auto;white-space:nowrap;text-decoration:none;font-weight:800;font-size:.85rem;
  color:#0B0F1A;background:linear-gradient(180deg,#E8CB94,#C9A96E);padding:9px 16px;border-radius:9px}
.efb-cta:hover{filter:brightness(1.05)}
.efb-x{flex:0 0 auto;border:none;background:none;color:#b08f4f;cursor:pointer;padding:4px;border-radius:6px}
.efb-x:hover{background:rgba(176,143,79,.12)}
@media(max-width:640px){.efb-txt span{display:none}}
`;
