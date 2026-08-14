"use client";
import { useState } from "react";
import { acceptStageAction } from "./proposal-actions";

// Shown to the customer on the Site Survey stage. They review the survey (and mockup, if any)
// then accept to unlock the proposal. Accepting the site survey is what the forward gate checks;
// the mockup accept is an extra acknowledgement. `onChange` bubbles the fresh acceptance map up
// so the gate updates; `onContinue` navigates to the proposal once the survey is accepted.
export default function CustomerAcceptBar({ accessId, acceptances = {}, onChange, onContinue, preview }) {
  const [busy, setBusy] = useState(false);
  const surveyOk = !!acceptances.site_survey;
  const mockupOk = !!acceptances.mockup;

  async function toggle(stage) {
    if (busy) return;
    setBusy(true);
    const on = stage === "site_survey" ? !surveyOk : !mockupOk;
    const r = await acceptStageAction(accessId, stage, on);
    setBusy(false);
    if (r?.ok) onChange?.(r.acceptances, r.stage);   // stage may have auto-advanced
  }

  return (
    <div className="cab-root">
      <style>{CAB_CSS}</style>
      <div className="cab-head">
        <span className="cab-title">Review &amp; Accept</span>
        <span className="cab-sub">Confirm your site survey below to unlock your proposal.</span>
      </div>
      <div className="cab-rows">
        <button type="button" className={`cab-row${surveyOk ? " on" : ""}`} disabled={busy || preview} onClick={() => toggle("site_survey")}>
          <span className="cab-check">{surveyOk ? "✓" : ""}</span>
          <span className="cab-lbl">I&apos;ve reviewed and accept the <b>Site Survey</b></span>
          <span className="cab-state">{surveyOk ? "Accepted" : "Tap to accept"}</span>
        </button>
        <button type="button" className={`cab-row${mockupOk ? " on" : ""}`} disabled={busy || preview} onClick={() => toggle("mockup")}>
          <span className="cab-check">{mockupOk ? "✓" : ""}</span>
          <span className="cab-lbl">I&apos;ve reviewed and accept the <b>Mockup</b> <span className="cab-opt">(if provided)</span></span>
          <span className="cab-state">{mockupOk ? "Accepted" : "Tap to accept"}</span>
        </button>
      </div>
      <button type="button" className="cab-continue" disabled={!surveyOk} onClick={() => onContinue?.()}>
        Continue to Proposal →
      </button>
      {preview && <div className="cab-note">Accepting is disabled in preview.</div>}
    </div>
  );
}

const CAB_CSS = `
.cab-root{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-top:3px solid var(--dv-gold,#C9A96E);border-radius:12px;padding:16px 18px;margin-bottom:16px;display:flex;flex-direction:column;gap:12px}
.cab-head{display:flex;flex-direction:column;gap:2px}
.cab-title{font-size:.92rem;font-weight:600;color:var(--dv-ink,#101418)}
.cab-sub{font-size:.78rem;color:var(--dv-meta,#787D84)}
.cab-rows{display:flex;flex-direction:column;gap:8px}
.cab-row{display:flex;align-items:center;gap:11px;width:100%;text-align:left;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-paper,#F4F4F2);padding:11px 13px;cursor:pointer;font-family:inherit}
.cab-row:hover:not(:disabled){border-color:var(--dv-gold,#C9A96E)}
.cab-row.on{border-color:var(--dv-green,#2E7D5B);background:rgba(46,125,91,.08)}
.cab-row:disabled{opacity:.6;cursor:default}
.cab-check{width:22px;height:22px;flex-shrink:0;border-radius:6px;border:1px solid var(--dv-line,#E4E4DF);display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:500;color:#fff;background:var(--dv-raise,#FBFBFA)}
.cab-row.on .cab-check{background:var(--dv-green,#2E7D5B);border-color:var(--dv-green,#2E7D5B)}
.cab-lbl{flex:1;font-size:.82rem;font-weight:500;color:var(--dv-ink,#101418)}
.cab-lbl b{font-weight:600}
.cab-opt{color:var(--dv-meta,#787D84);font-weight:500}
.cab-state{font-size:.7rem;font-weight:500;text-transform:uppercase;letter-spacing:.03em;color:var(--dv-meta,#787D84)}
.cab-row.on .cab-state{color:var(--dv-green,#2E7D5B)}
.cab-continue{height:42px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.cab-continue:hover:not(:disabled){filter:brightness(1.12)}
.cab-continue:disabled{opacity:.45;cursor:default}
.cab-note{font-size:.72rem;color:var(--dv-meta,#787D84);text-align:center}
`;
