"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { stagesForType } from "../../lib/spec";
import { setLegacyProjectStateAction, getLegacyProjectStateAction } from "../project/[accessId]/legacy-actions";

// The admin escape hatch for a LEGACY project — the thing docs/migration-report.md tells the owner to
// use for every project the migration refuses to decide (a drifted signature, a stage ahead of its
// evidence, a finished job with no completion stamp). The ordinary "Change stage" items reach only
// Consulting / Install / Completion and are gate-aware; this reaches every master stage and is
// deliberately NOT gate-aware, because the whole point is a human overruling missing records.
//
// Admin only. The capability is enforced in the server action (`legacy.override`), not here — this
// component is reached through `can(role, "legacy.override")` at the call site, and a non-admin who
// invokes the action directly is refused server-side anyway.
//
// Smart defaults (house rule 1): the dialog opens on the project's CURRENT stage, and when it offers
// to mark the job complete the date is prefilled from the newest dated evidence on the row (the last
// confirmed payment, or a human-recorded entry into Completion) with the source named. It is never
// prefilled with today: completed_at + warranty_months IS the warranty.
export default function LegacyStageOverride({ project, onClose, onChanged }) {
  const id = project?.access_id;
  const [ctx, setCtx] = useState(null);                 // server truth: stage, stamp, evidence date
  const [stage, setStage] = useState(project?.stage || "");
  const [complete, setComplete] = useState(null);        // null = leave · true = stamp · false = clear
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    getLegacyProjectStateAction(id).then((r) => {
      if (!live) return;
      if (r?.error) { setErr(r.error); return; }
      setCtx(r);
      setStage(r.stage);
      setDate(r.completedAt ? String(r.completedAt).slice(0, 10) : (r.evidenceDate || ""));
    }).catch(() => setErr("Could not read the project."));
    return () => { live = false; };
  }, [id]);

  const stages = stagesForType(ctx?.projectType || project?.project_type || "A");
  const stamped = !!ctx?.completedAt;
  const needsDate = complete === true && !stamped;

  async function save() {
    setErr(null);
    if (needsDate && !date) { setErr("Enter the date the job finished — it starts the warranty."); return; }
    setBusy(true);
    const r = await setLegacyProjectStateAction(id, {
      stage,
      completed: complete,
      completedAt: needsDate ? date : null,
      reason: reason.trim() || null,
    }).catch(() => ({ error: "That didn't save." }));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onChanged?.();
    onClose?.();
  }

  return createPortal(
    <div className="lso-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="lso-modal" role="dialog" aria-modal="true" aria-label="Set stage">
        <div className="lso-h">Set stage · {id}</div>
        <div className="lso-sub">Overrides the lifecycle gate. Logged on the project.</div>

        <div className="lso-grid">
          {stages.map((s) => (
            <button key={s.key} type="button" disabled={busy}
              className={`lso-stage${stage === s.key ? " on" : ""}${ctx?.stage === s.key ? " now" : ""}`}
              onClick={() => setStage(s.key)}>{s.label}</button>
          ))}
        </div>

        <div className="lso-row">
          <button type="button" disabled={busy} className={`lso-chip${complete === null ? " on" : ""}`} onClick={() => setComplete(null)}>Leave</button>
          {!stamped && <button type="button" disabled={busy} className={`lso-chip${complete === true ? " on" : ""}`} onClick={() => setComplete(true)}>Mark complete</button>}
          {stamped && <button type="button" disabled={busy} className={`lso-chip${complete === false ? " on" : ""}`} onClick={() => setComplete(false)}>Clear completion</button>}
        </div>

        {stamped && <div className="lso-note">Completed {String(ctx.completedAt).slice(0, 10)}</div>}
        {needsDate && (
          <>
            <input className="lso-in" type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} aria-label="Completion date" />
            <div className="lso-note">
              {ctx?.evidenceDate && date === ctx.evidenceDate
                ? `From ${ctx.evidenceSource}. Starts the warranty — change it if the job finished on a different day.`
                : "Starts the warranty, so it must be the day the job actually finished."}
            </div>
          </>
        )}

        <input className="lso-in" placeholder="Why" value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />

        {err && <div className="lso-err">{err}</div>}
        <div className="lso-acts">
          <button className="lso-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="lso-go" disabled={busy || !stage || !ctx} onClick={save}>Save</button>
        </div>
      </div>
      <style>{LSO_CSS}</style>
    </div>, document.body);
}

const LSO_CSS = `
.lso-bg{position:fixed;inset:0;z-index:2147483602;background:rgba(14,18,30,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.lso-modal{width:100%;max-width:420px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;box-shadow:0 20px 60px rgba(14,18,30,.34);padding:18px;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.lso-h{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418)}
.lso-sub{margin-top:4px;font-size:.8rem;color:var(--dv-meta,#787D84)}
.lso-grid{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.lso-stage{padding:9px 6px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:600 .76rem/1.1 inherit;cursor:pointer}
.lso-stage.now{border-style:dashed}
.lso-stage.on{border-color:#C9A96E;background:#C9A96E;color:#1b1f28}
.lso-row{margin-top:12px;display:flex;gap:6px;flex-wrap:wrap}
.lso-chip{padding:7px 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:999px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:600 .78rem/1 inherit;cursor:pointer}
.lso-chip.on{border-color:#C9A96E;background:#C9A96E;color:#1b1f28}
.lso-in{margin-top:10px;width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-bg,#fff);color:var(--dv-ink,#101418);font:400 .85rem/1.2 inherit}
.lso-note{margin-top:6px;font-size:.74rem;color:var(--dv-meta,#787D84)}
.lso-err{margin-top:10px;font-size:.8rem;color:#c0392b}
.lso-acts{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
.lso-go{padding:9px 18px;border:0;border-radius:9px;background:#C9A96E;color:#1b1f28;font:700 .85rem/1 inherit;cursor:pointer}
.lso-ghost{padding:9px 16px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:700 .85rem/1 inherit;cursor:pointer}
.lso-go:disabled,.lso-ghost:disabled,.lso-stage:disabled,.lso-chip:disabled{opacity:.5;cursor:default}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .lso-modal{background:#14171f}}
`;
