"use client";
import { useState } from "react";
import { acceptStageAction, submitToolAction, saveToolDataAction } from "./proposal-actions";

// The tools write to localStorage and mirror to the server on a ~5s poll (tool-sync.js). A Submit
// clicked inside that window would be rejected server-side ("no data yet") — so before submitting,
// push the CURRENT local draft up. Makes Submit deterministic instead of racing the autosync.
const DRAFT_STORE = {
  site_survey: { tool: "survey", key: (id) => `iottechs_sitesurvey_v2_${id}` },
  mockup:      { tool: "mockup", key: (id) => `iot_cctv_${id}` },
};
async function flushDraft(accessId, stageKey) {
  const d = DRAFT_STORE[stageKey];
  if (!d) return;
  try {
    const raw = localStorage.getItem(d.key(accessId));
    if (raw != null) await saveToolDataAction(accessId, d.tool, raw);
  } catch { /* no localStorage / no access — the server copy is whatever the autosync managed */ }
}

// Survey-stage approval, data-aware:
//  - ToolApproveBar sits UNDER a tool (survey / mockup). It only appears when that tool has
//    data. The customer approves it there; if the tool later changes, the stored fingerprint
//    no longer matches and the bar flips to "changed — please re-approve" (void).
//  - SmoothSailing is the empty state when neither tool has anything to review.
//  - surveySatisfied() is the shared gate: every tool WITH data must be currently approved.

export function toolAccepted(meta, acceptance) {
  return !!(acceptance && acceptance.fingerprint === meta?.fingerprint);
}
export function surveySatisfied(toolMeta, acceptances) {
  if (!toolMeta) return true;
  const ok = (m, key) => !m?.has || toolAccepted(m, acceptances?.[key]);
  return ok(toolMeta.survey, "site_survey") && ok(toolMeta.mockup, "mockup");
}

const LABEL = { site_survey: "site survey", mockup: "mockup" };
const fmt = (s) => { try { return new Date(String(s).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return s; } };

export function ToolApproveBar({ accessId, stageKey, meta, acceptance, submission, role, preview, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!meta?.has) return null;                       // nothing here yet for this tool

  const approved = !!acceptance;
  const current  = toolAccepted(meta, acceptance);   // approved AND matches the live data
  const voided   = approved && !current;             // approved but the tool changed since
  const isCustomer = role === "customer";
  const isOffice   = ["admin", "manager", "sales"].includes(role);
  const label = LABEL[stageKey] || "item";

  // Submitted for review = the office pushed it AND the tool hasn't changed since.
  const submittedCurrent = toolAccepted(meta, submission);
  const submittedStale   = !!submission && !submittedCurrent;

  async function approve() {
    if (busy || preview) return;
    setBusy(true); setErr(null);
    const r = await acceptStageAction(accessId, stageKey, true);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onChange?.(r.acceptances, r.stage);
  }
  async function submit(on) {
    if (busy || preview) return;
    setBusy(true); setErr(null);
    if (on) await flushDraft(accessId, stageKey);   // make sure the server has the latest draft
    const r = await submitToolAction(accessId, stageKey, on);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onChange?.(r.acceptances);
  }

  // ---- Office: Submit for review (and re-submit when edited after submitting) ----
  if (isOffice) {
    return (
      <div className={`tab-root${current ? " ok" : submittedCurrent ? " ok" : ""}`}>
        {current ? (
          <div className="tab-row">
            <span className="tab-check">✓</span>
            <span className="tab-msg">Customer approved this {label}{acceptance.by ? ` — ${acceptance.by}` : ""}{acceptance.at ? ` · ${fmt(acceptance.at)}` : ""}.</span>
          </div>
        ) : submittedCurrent ? (
          <div className="tab-row">
            <span className="tab-check">✓</span>
            <span className="tab-msg">Submitted for review{submission.at ? ` · ${fmt(submission.at)}` : ""} — awaiting customer approval.</span>
            <button className="tab-btn ghost" disabled={busy || preview} onClick={() => submit(false)}>Unsubmit</button>
          </div>
        ) : submittedStale ? (
          <div className="tab-row">
            <span className="tab-warn">!</span>
            <span className="tab-msg"><b>You've changed this {label}</b> since submitting — re-submit so the customer reviews the latest.</span>
            <button className="tab-btn" disabled={busy || preview} onClick={() => submit(true)}>{busy ? "Submitting…" : `Re-submit ${label}`}</button>
          </div>
        ) : (
          <div className="tab-row">
            <span className="tab-dot" />
            <span className="tab-msg">When this {label} is ready, submit it for the customer to review.</span>
            <button className="tab-btn" disabled={busy || preview} onClick={() => submit(true)}>{busy ? "Submitting…" : `Submit ${label}`}</button>
          </div>
        )}
        {err && <div className="tab-err">{err}</div>}
        {preview && <div className="tab-preview">Submitting is disabled in preview.</div>}
        <style>{TAB_CSS}</style>
      </div>
    );
  }

  // ---- Customer: can only approve once the office has submitted the current version ----
  return (
    <div className={`tab-root${current ? " ok" : voided ? " void" : ""}`}>
      {current ? (
        <div className="tab-row">
          <span className="tab-check">✓</span>
          <span className="tab-msg">You approved this {label}{acceptance.by ? ` — ${acceptance.by}` : ""}{acceptance.at ? ` · ${fmt(acceptance.at)}` : ""}.</span>
        </div>
      ) : !submittedCurrent ? (
        <div className="tab-row">
          <span className="tab-dot" />
          <span className="tab-msg">Your {label} is being prepared — we'll let you know the moment it's ready to review.</span>
        </div>
      ) : voided ? (
        <div className="tab-row">
          <span className="tab-warn">!</span>
          <span className="tab-msg"><b>This {label} was updated</b> since you approved it — please review the changes and approve again.</span>
          {isCustomer && <button className="tab-btn" disabled={busy || preview} onClick={approve}>Re-approve {label}</button>}
        </div>
      ) : (
        <div className="tab-row">
          <span className="tab-dot" />
          <span className="tab-msg">Reviewed everything? Approve this {label} to continue.</span>
          {isCustomer && <button className="tab-btn" disabled={busy || preview} onClick={approve}>{busy ? "Saving…" : `Approve ${label}`}</button>}
        </div>
      )}
      {err && <div className="tab-err">{err}</div>}
      {preview && isCustomer && <div className="tab-preview">Approving is disabled in preview.</div>}
      <style>{TAB_CSS}</style>
    </div>
  );
}

// Compact header affordance so office roles see the Submit action WITHOUT expanding the tool.
// Mirrors ToolApproveBar's office logic but as a single pill: Submit → Submitted → Approved.
// The full bar (below the tool) still handles unsubmit / re-submit / detail.
export function ToolSubmitButton({ accessId, stageKey, meta, acceptance, submission, role, preview, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const isOffice = ["admin", "manager", "sales"].includes(role);
  if (!isOffice) return null;                           // customers approve; only office submits
  const label = LABEL[stageKey] || "item";
  const hasData = !!meta?.has;
  // Once there's data, reflect the state; otherwise keep a visible (disabled) Submit so office
  // always know where the control is — it enables the moment the tool has something to send.
  if (hasData && toolAccepted(meta, acceptance))  return <span className="pv-tool-chip go">Approved</span>;
  if (hasData && toolAccepted(meta, submission))  return <span className="pv-tool-chip sent">Submitted</span>;
  async function go(e) {
    e.stopPropagation();                                // don't toggle the accordion
    if (busy || preview || !hasData) return;
    setBusy(true); setErr(null);
    // The tool's draft may still be local-only (autosync polls every ~5s) — push it up first so
    // the server sees the same data the office is looking at.
    await flushDraft(accessId, stageKey);
    const r = await submitToolAction(accessId, stageKey, true);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }          // never swallow — show why it didn't submit
    onChange?.(r.acceptances);
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {err && <span className="pv-tool-chip warn" title={err}>!</span>}
      <button type="button" className="pv-tool-submit" disabled={busy || preview || !hasData}
        onClick={go} title={err || (hasData ? `Submit ${label} for customer review` : `Add to the ${label} first, then submit`)}>
        {busy ? "…" : err ? "Retry" : "Submit"}
      </button>
    </span>
  );
}

export function SmoothSailing({ onContinue, preview }) {
  return (
    <div className="ssl-root">
      <div className="ssl-scene">
        <div className="ssl-sky" />
        <div className="ssl-sun" />
        {/* boat bobs on the waves */}
        <div className="ssl-boat">
          <svg viewBox="0 0 120 96" width="150" height="120">
            {/* sail + mast */}
            <line x1="60" y1="16" x2="60" y2="62" stroke="#8a6d2f" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 18 L60 58 L92 58 Z" fill="#C9A96E" />
            <path d="M58 20 L58 58 L30 58 Z" fill="#E8CB94" />
            {/* hull */}
            <path d="M22 62 H98 L88 80 H32 Z" fill="#2C3347" />
            <path d="M22 62 H98 L96 66 H24 Z" fill="#3a4460" />
            {/* little technician in a life vest */}
            <circle cx="60" cy="52" r="5" fill="#f0d9b8" />
            <rect x="55" y="57" width="10" height="9" rx="2" fill="#E8743B" />
            <rect x="57.5" y="57" width="5" height="9" fill="#0B0F1A" opacity=".25" />
          </svg>
        </div>
        {/* animated waves */}
        <svg className="ssl-waves" viewBox="0 0 240 24" preserveAspectRatio="none">
          <path d="M0 12 Q 20 4 40 12 T 80 12 T 120 12 T 160 12 T 200 12 T 240 12 V24 H0 Z" fill="#4b6a9b" opacity=".55" />
          <path d="M0 14 Q 20 6 40 14 T 80 14 T 120 14 T 160 14 T 200 14 T 240 14 V24 H0 Z" fill="#2C3347" opacity=".9" />
        </svg>
      </div>
      <h3 className="ssl-title">No survey — smooth sailing from here</h3>
      <p className="ssl-sub">There's nothing to review on this step. You're all set to move ahead.</p>
      <button className="ssl-btn" disabled={preview} onClick={() => onContinue?.()}>Go on to the Next Step →</button>
      {preview && <div className="ssl-preview">Navigation is disabled in preview.</div>}
      <style>{SSL_CSS}</style>
    </div>
  );
}

const TAB_CSS = `
.tab-root{margin-top:10px;border:1px solid var(--line,#d9d4ca);border-radius:10px;background:#fff;padding:12px 14px}
.tab-root.ok{background:#eef7f0;border-color:#bfe0c9}
.tab-root.void{background:#fdf7e9;border-color:#e5d3a1}
.tab-row{display:flex;align-items:center;gap:11px;flex-wrap:wrap}
.tab-check{width:22px;height:22px;flex-shrink:0;border-radius:50%;background:#2f7d5a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.86rem;font-weight:800}
.tab-warn{width:22px;height:22px;flex-shrink:0;border-radius:50%;background:#C9A96E;color:#0B0F1A;display:flex;align-items:center;justify-content:center;font-size:.86rem;font-weight:800}
.tab-dot{width:10px;height:10px;flex-shrink:0;border-radius:50%;border:2px solid #C9A96E}
.tab-msg{flex:1;min-width:180px;font-size:.84rem;color:#0B0F1A}
.tab-msg b{font-weight:800}
.tab-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.tab-btn:hover{filter:brightness(1.04)}
.tab-btn:disabled{opacity:.5;cursor:default}
.tab-btn.ghost{background:#fff;border:1px solid var(--line,#d9d4ca);color:#6f7686;font-weight:700}
.tab-btn.ghost:hover{filter:none;border-color:#b9b3a6;color:#41485a}
.tab-err{margin-top:8px;font-size:.78rem;font-weight:600;color:#a8442f}
.tab-preview{margin-top:6px;font-size:.72rem;color:var(--muted,#6f7686)}
`;

const SSL_CSS = `
.ssl-root{background:#fff;border:1px solid #d9d4ca;border-top:3px solid #4b6a9b;border-radius:14px;padding:22px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(11,15,26,.06)}
.ssl-scene{position:relative;width:100%;max-width:360px;height:150px;border-radius:12px;overflow:hidden;
  background:linear-gradient(180deg,#dbeafe 0%,#bfd4ef 55%,#8fb0dd 100%)}
.ssl-sun{position:absolute;top:18px;right:34px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 40% 40%,#FFF4D6,#F5C766);box-shadow:0 0 26px 6px rgba(245,199,102,.55)}
.ssl-boat{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);animation:sslBob 3.2s ease-in-out infinite}
.ssl-waves{position:absolute;left:0;bottom:0;width:200%;height:34px;animation:sslDrift 5s linear infinite}
@keyframes sslBob{0%,100%{transform:translateX(-50%) translateY(0) rotate(-2deg)}50%{transform:translateX(-50%) translateY(-6px) rotate(2deg)}}
@keyframes sslDrift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.ssl-title{margin:6px 0 0;font-size:1.05rem;font-weight:800;color:#0B0F1A}
.ssl-sub{margin:0;font-size:.86rem;color:#4a5270;max-width:420px}
.ssl-btn{margin-top:6px;height:46px;padding:0 26px;border:none;border-radius:10px;background:#0B0F1A;color:#fff;font-size:.9rem;font-weight:800;cursor:pointer;font-family:inherit}
.ssl-btn:hover{background:#2C3347}
.ssl-btn:disabled{opacity:.5;cursor:default}
.ssl-preview{font-size:.72rem;color:#6f7686}
`;
