"use client";

import { useState } from "react";
import { STEP_RUBRICS, P1_EVAL_STEPS, P1_FLOW, statusLabel, nextP1Status, stageRequirements, stageComplete } from "../../../lib/hiring";
import { saveHiringStepAction, advanceHiringAction, hiringDecisionAction } from "../actions";

const STEPPER = [{ key: "assessment", label: "Assessment" }, ...P1_EVAL_STEPS.map((k) => ({ key: k, label: STEP_RUBRICS[k].label })), { key: "final_review", label: "Final Review" }];
const REC = { advance: "Advance", hold: "Hold", decline: "Decline" };

export default function RecruitmentSteps({ appId, status, steps: stepsInit = {}, assessment, canHire = true }) {
  const [status0, setStatus] = useState(status);
  const [steps, setSteps] = useState(stepsInit || {});
  const declined = status0 === "declined";
  const curIdx = P1_FLOW.indexOf(status0);
  // Default the selected panel to the stage the candidate is ACTUALLY at — so at the Assessment stage
  // we open on Assessment (review it first), not jump ahead to the Phone Interview scorecard.
  const [sel, setSel] = useState(STEPPER.some((s) => s.key === status0) ? status0 : "assessment");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [override, setOverride] = useState(null);        // {missing:[…]} when a gated advance was blocked
  const [overrideReason, setOverrideReason] = useState("");
  // Completion criteria for the stage the candidate is CURRENTLY at (what "Advance" moves them from).
  const stageCtx = { assessment, steps };
  const curReqs = stageRequirements(status0, stageCtx);
  const curComplete = stageComplete(status0, stageCtx);
  // A retake still pending office review, or approved but not yet re-submitted — decisions wait for
  // it. Key off retake.status directly: a PENDING retake sits at assessment.status 'graded' (that's
  // where the candidate requests one from), so the old `status !== "graded"` test missed it.
  const retakeBlocking = assessment?.retake?.status === "pending"
    || (assessment?.retake?.status === "approved" && assessment.status !== "graded");

  const rubric = STEP_RUBRICS[sel];
  const saved = steps[sel] || {};
  const [ratings, setRatings] = useState(saved.ratings || {});
  const [notes, setNotes] = useState(saved.notes || "");
  const [rec, setRec] = useState(saved.recommendation || "");

  // Any step is selectable — the eval steps show a scorecard; Assessment / Final Review show their
  // own panel (no rubric). Guard only against unknown keys.
  function selectStep(k) {
    if (!STEPPER.some((s) => s.key === k)) return;
    setSel(k); const s = steps[k] || {};
    setRatings(s.ratings || {}); setNotes(s.notes || ""); setRec(s.recommendation || ""); setMsg("");
  }

  async function save() {
    setBusy(true); setMsg("");
    const r = await saveHiringStepAction(appId, sel, { ratings, notes, recommendation: rec });
    if (r?.ok) { setSteps((p) => ({ ...p, [sel]: { ...p[sel], ratings, notes, recommendation: rec, score: r.score } })); setMsg("Saved"); }
    else setMsg(r?.error || "Could not save");
    setBusy(false);
  }
  async function advance(force = false) {
    setBusy(true); setMsg("");
    const r = await advanceHiringAction(appId, force ? { override: true, reason: overrideReason } : {});
    if (r?.ok) { setOverride(null); setOverrideReason(""); setStatus(r.status); selectStep(P1_EVAL_STEPS.includes(r.status) ? r.status : sel); }
    else if (r?.error === "incomplete") { setOverride({ missing: r.missing || [] }); }
    else setMsg(r?.error || "Could not advance");
    setBusy(false);
  }
  async function decide(decision) {
    if (decision !== "decline" && !canHire) { setMsg("Only an admin can create the staff account."); return; }
    if (decision === "decline" && !confirm("Mark this candidate Not Selected?")) return;
    setBusy(true); setMsg("");
    const r = await hiringDecisionAction(appId, decision, { notes });
    if (r?.ok) location.reload(); else setMsg(r?.error || "Could not record decision");
    setBusy(false);
  }

  const atFinal = status0 === "final_review";
  const nextLabel = statusLabel(nextP1Status(status0));

  return (
    <div className="rs">
      <div className="rs-h"><h3>Recruitment</h3><span className="rs-cur">Now: {statusLabel(status0)}</span></div>

      <div className="rs-stepper">
        {STEPPER.map((s, i) => {
          const idx = P1_FLOW.indexOf(s.key);
          const scored = steps[s.key]?.score != null;
          // Declined leaves curIdx at -1 (not on the P1 ladder) — fall back to the saved
          // scorecards so completed steps still read as done instead of everything going "todo".
          const state = declined ? (scored ? "done" : "todo") : idx < curIdx ? "done" : idx === curIdx ? "cur" : "todo";
          return (
            <button key={s.key} className={`rs-step ${state}${sel === s.key ? " sel" : ""}`} onClick={() => selectStep(s.key)}>
              <span className="rs-dot">{state === "done" ? "✓" : i + 1}</span>
              <span className="rs-slabel">{s.label}</span>
              {scored && <span className="rs-sscore">{steps[s.key].score}/5</span>}
            </button>
          );
        })}
      </div>

      {curReqs.length > 0 && !atFinal && !declined && (
        <div className={`rs-reqs${curComplete ? " ok" : ""}`}>
          <div className="rs-reqs-h">To advance from {statusLabel(status0)}{curComplete ? " — ready" : ""}:</div>
          <ul>
            {curReqs.map((r) => (
              <li key={r.key} className={r.done ? "done" : r.optional ? "opt" : "todo"}>
                <span className="rs-req-mk">{r.done ? "✓" : "•"}</span>{r.label}{r.optional && !r.done ? " · optional" : ""}
              </li>
            ))}
          </ul>
          {override && (
            <div className="rs-override">
              <div className="rs-override-h">{override.missing.length ? `Incomplete: ${override.missing.join(", ")}. ` : ""}Advance anyway?</div>
              <input className="rs-override-in" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason for the override (required, logged)…" />
              <div className="rs-override-actions">
                <button className="rs-btn ghost" onClick={() => { setOverride(null); setOverrideReason(""); }} disabled={busy}>Cancel</button>
                <button className="rs-btn" onClick={() => advance(true)} disabled={busy || overrideReason.trim().length < 3}>{busy ? "Advancing…" : "Continue anyway"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {rubric && (
        <div className="rs-card">
          <div className="rs-card-h">{rubric.label} scorecard{saved.by && <span className="rs-by">last by {saved.by}</span>}</div>
          {rubric.criteria.map(([key, label]) => (
            <div className="rs-crit" key={key}>
              <span className="rs-crit-l">{label}</span>
              <div className="rs-rate">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button key={v} className={`rs-r${(ratings[key] || 0) >= v ? " on" : ""}`} onClick={() => setRatings((p) => ({ ...p, [key]: v }))}>{v}</button>
                ))}
              </div>
            </div>
          ))}
          <textarea className="rs-notes" rows={2} placeholder="Notes — what stood out, concerns…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="rs-rec">
            <span>Recommendation</span>
            {Object.entries(REC).map(([k, l]) => <button key={k} className={`rs-rec-b ${k}${rec === k ? " on" : ""}`} onClick={() => setRec(k)}>{l}</button>)}
          </div>
          <div className="rs-actions">
            <button className="rs-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save scorecard"}</button>
            {!atFinal && !declined && <button className="rs-btn ghost" onClick={() => advance()} disabled={busy}>Advance → {nextLabel}</button>}
            {msg && <span className="rs-msg">{msg}</span>}
          </div>
        </div>
      )}

      {sel === "assessment" && (
        <div className="rs-card">
          <div className="rs-card-h">Assessment</div>
          <p className="rs-panel-note">Review the candidate&rsquo;s assessment score, timing, and answers in the card above. When you&rsquo;re ready, advance to the phone interview.</p>
          <div className="rs-actions">
            {status0 === "assessment" && !declined && (
              <button className="rs-btn ghost" onClick={() => advance()} disabled={busy || retakeBlocking}>{busy ? "Advancing…" : `Advance → ${statusLabel(nextP1Status("assessment"))}`}</button>
            )}
            {status0 !== "assessment" && curIdx > P1_FLOW.indexOf("assessment") && <span className="rs-msg">Assessment stage complete.</span>}
            {msg && <span className="rs-msg">{msg}</span>}
          </div>
          {retakeBlocking && <div className="rs-note">Resolve the retake request before advancing.</div>}
        </div>
      )}
      {sel === "final_review" && (
        <div className="rs-card">
          <div className="rs-card-h">Final review</div>
          <p className="rs-panel-note">{atFinal ? "All steps complete — record the outcome in the decision panel below." : "Work through the earlier steps first; the hire decision unlocks once the candidate reaches Final Review."}</p>
        </div>
      )}

      <div className={`rs-decision${atFinal ? " live" : ""}`}>
        <div className="rs-decision-h">{atFinal ? "Final review — decide" : "Decision (available at Final Review)"}</div>
        <div className="rs-decision-b">
          <button className="rs-d hire" disabled={busy || !atFinal || !canHire || retakeBlocking} onClick={() => decide("hire")}>Hire</button>
          <button className="rs-d cond" disabled={busy || !atFinal || !canHire || retakeBlocking} onClick={() => decide("conditional")}>Conditional Hire</button>
          <button className="rs-d decline" disabled={busy || retakeBlocking} onClick={() => decide("decline")}>Not Selected</button>
        </div>
        {retakeBlocking && <div className="rs-note">Retake in progress.</div>}
        {!canHire && !retakeBlocking && <div className="rs-note">Only an admin can create the staff account (Hire / Conditional).</div>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.rs{--gold-deep:#A8842F;--green:#2E7D5B;--red:#C4553D;--amber:#B0801F;--line:#E4E4DF;--muted:#787D84;--ink:#101418;--paper:#F4F4F2;
  border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px 18px;font-family:var(--font-sans,'Instrument Sans',sans-serif);margin-top:14px}
.rs-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.rs-h h3{margin:0;font-size:1.05rem;font-weight:800;color:var(--ink)}
.rs-cur{font-size:.78rem;color:var(--gold-deep);font-weight:600}
.rs-stepper{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:14px}
.rs-step{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 11px;cursor:pointer;min-width:76px;font:inherit}
.rs-step:disabled{cursor:default;opacity:.7}
.rs-step.sel{border-color:var(--gold-deep);background:#F6F0E2}
.rs-dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-family:var(--font-mono,ui-monospace);font-size:.72rem;font-weight:700;background:#fff;border:1px solid var(--line);color:var(--muted)}
.rs-step.done .rs-dot{background:var(--green);color:#fff;border-color:transparent}
.rs-step.cur .rs-dot{background:var(--gold-deep);color:#fff;border-color:transparent}
.rs-slabel{font-size:.7rem;font-weight:600;color:var(--ink);text-align:center;line-height:1.15}
.rs-sscore{font-size:.64rem;color:var(--gold-deep);font-family:var(--font-mono,ui-monospace)}
.rs-card{border:1px solid var(--line);border-radius:11px;padding:13px 14px;background:var(--paper);margin-bottom:12px}
.rs-panel-note{margin:0 0 4px;font-size:.86rem;color:var(--muted);line-height:1.5}
.rs-reqs{border:1px solid var(--line);border-radius:11px;padding:11px 14px;background:#fff;margin-bottom:12px}
.rs-reqs.ok{background:#F3F8F4;border-color:#CFE6D8}
.rs-reqs-h{font-size:.74rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.rs-reqs ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.rs-reqs li{display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--ink)}
.rs-reqs li.todo{color:var(--muted)}
.rs-reqs li.opt{color:var(--faint,#A6ABB1)}
.rs-req-mk{flex:none;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;font-size:.7rem;font-weight:800;background:#EFEFEA;color:var(--muted)}
.rs-reqs li.done .rs-req-mk{background:var(--green);color:#fff}
.rs-override{margin-top:11px;border-top:1px solid var(--line);padding-top:11px}
.rs-override-h{font-size:.82rem;font-weight:700;color:var(--red);margin-bottom:7px}
.rs-override-in{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:.84rem;outline:none}
.rs-override-in:focus{border-color:var(--gold-deep)}
.rs-override-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:9px}
.rs-card-h{font-size:.9rem;font-weight:700;color:var(--ink);margin-bottom:11px;display:flex;justify-content:space-between}
.rs-by{font-size:.72rem;color:var(--muted);font-weight:500}
.rs-crit{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0}
.rs-crit-l{font-size:.86rem;color:var(--ink)}
.rs-rate{display:flex;gap:4px}
.rs-r{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:#fff;font:inherit;font-size:.78rem;font-weight:700;color:var(--muted);cursor:pointer}
.rs-r.on{background:var(--gold-deep);color:#fff;border-color:transparent}
.rs-notes{width:100%;box-sizing:border-box;margin-top:9px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:.86rem;color:var(--ink);background:#fff;outline:none;resize:vertical}
.rs-rec{display:flex;align-items:center;gap:7px;margin-top:10px;font-size:.8rem;color:var(--muted)}
.rs-rec-b{border:1px solid var(--line);background:#fff;border-radius:7px;padding:4px 11px;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;color:var(--ink)}
.rs-rec-b.advance.on{background:#E6F0EA;color:var(--green);border-color:transparent}
.rs-rec-b.hold.on{background:#F6EEDC;color:var(--amber);border-color:transparent}
.rs-rec-b.decline.on{background:#F6E7E2;color:var(--red);border-color:transparent}
.rs-actions{display:flex;align-items:center;gap:9px;margin-top:12px}
.rs-btn{background:var(--gold-deep);color:#fff;border:none;border-radius:8px;padding:8px 15px;font:inherit;font-weight:700;font-size:.83rem;cursor:pointer}
.rs-btn.ghost{background:#fff;color:var(--gold-deep);border:1px solid var(--line)}
.rs-btn:disabled{opacity:.5;cursor:default}
.rs-msg{font-size:.8rem;color:var(--green)}
.rs-decision{border-top:1px solid var(--line);padding-top:13px;opacity:.6}
.rs-decision.live{opacity:1}
.rs-decision-h{font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.rs-decision-b{display:flex;gap:9px;flex-wrap:wrap}
.rs-d{border:none;border-radius:9px;padding:10px 18px;font:inherit;font-weight:700;font-size:.88rem;cursor:pointer}
.rs-d.hire{background:var(--green);color:#fff}
.rs-d.cond{background:#F6EEDC;color:var(--amber)}
.rs-d.decline{background:#fff;color:var(--red);border:1px solid #E7C6BC}
.rs-d:disabled{opacity:.45;cursor:not-allowed}
.rs-note{font-size:.76rem;color:var(--muted);margin-top:8px}
`;
