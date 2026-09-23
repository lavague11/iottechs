"use client";
import { useState } from "react";
import { titleCase } from "../../../lib/proposal";
import { ISSUE_REASONS, ISSUE_STATES, issueOpen, stepsFor } from "../../../lib/install-checklist-model";
import { reportInstallIssueAction, installIssueAction } from "./actions";

// Install issue flags — the work order's "something is wrong here" channel (Phase 1).
//   <IssueFlag>   header control: SVG flag + open count.
//   <IssueSheet>  right drawer (desktop) / bottom sheet (mobile): open + closed flags with the
//                 role's actions, and the Flag form (target → reason → note → photo).
//   <HistorySheet> the work order's own activity: every claimed step (who / when) + every flag event.
// The state machine + permissions are server-side (actions.js); this file only renders.

const fmt = (t) => { if (!t) return ""; try { return new Date(String(t).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const Flag = ({ size = 15 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h11l-1 4 1 4H5"/></svg>;
const X = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

export function IssueFlag({ count = 0, onClick, title = "Report issue" }) {
  return (
    <button type="button" className={`iss-flagbtn${count ? " has" : ""}`} onClick={onClick} title={title} aria-label={count ? `${count} open issues` : title}>
      <Flag />{count > 0 && <span className="iss-flagn">{count}</span>}
    </button>
  );
}

// `items` = the work order's line items [{id,name,type}], `crew` = technician names for rework assignment.
export function IssueSheet({ accessId, role, userName, issues = [], items = [], crew = [], initialTarget = null, onClose, onChange }) {
  const [mode, setMode] = useState(initialTarget ? "new" : "list");
  const [target, setTarget] = useState(initialTarget || { kind: "order" });
  const [reason, setReason] = useState(ISSUE_REASONS[0]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);      // { id, url } once uploaded
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [assign, setAssign] = useState({});      // { [issueId]: techName }
  const [showClosed, setShowClosed] = useState(false);
  const adj = ["admin", "manager"].includes(role);
  const canReport = ["admin", "manager", "tech"].includes(role);
  const open = issues.filter(issueOpen), closed = issues.filter((i) => !issueOpen(i));
  const itemOf = (id) => items.find((it) => it.id === id);

  async function upload(file) {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("project", accessId); fd.append("kind", "install-issue");
      const r = await fetch("/api/media", { method: "POST", body: fd }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.error || "upload failed");
      setPhoto({ id: r.id, url: r.url });
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }
  async function submit() {
    if (busy) return;
    setBusy(true); setErr(null);
    const it = target.kind !== "order" ? itemOf(target.id) : null;
    const label = target.kind === "order" ? null : target.kind === "step" ? `${titleCase(it?.name || "")} · ${stepsFor(it?.type)[target.stepIdx] || ""}` : titleCase(it?.name || "");
    const r = await reportInstallIssueAction(accessId, { targetKind: target.kind, targetId: target.id || null, stepIdx: target.stepIdx ?? null, targetLabel: label, reason, note, mediaId: photo?.id || null });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onChange?.(r.issues);
    setMode("list"); setNote(""); setPhoto(null); setReason(ISSUE_REASONS[0]); setTarget({ kind: "order" });
  }
  async function act(issue, action, extra) {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await installIssueAction(accessId, issue.id, action, extra);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onChange?.(r.issues);
  }

  const card = (i) => {
    const mine = role === "tech" && i.assigned_to && String(i.assigned_to).toLowerCase() === String(userName || "").toLowerCase();
    const isOpen = issueOpen(i);
    return (
      <div key={i.id} className={`iss-card ${i.status.toLowerCase()}`}>
        <div className="iss-card-top">
          <span className="iss-target">{i.target_kind === "order" ? "Work order" : i.target_label}</span>
          <span className={`iss-pill ${i.status.toLowerCase()}`}>{ISSUE_STATES[i.status] || i.status}</span>
        </div>
        <div className="iss-reason">{i.reason}{i.note ? <span className="iss-note"> — {i.note}</span> : null}</div>
        <div className="iss-meta">
          {i.raised_by || "—"} · {fmt(i.created_at)}
          {i.assigned_to && <> · rework: <b>{i.assigned_to}</b></>}
          {i.fixed_at && <> · fixed {fmt(i.fixed_at)}{i.fixed_by ? ` by ${i.fixed_by}` : ""}</>}
          {i.closed_at && <> · {i.status === "RESOLVED" ? "resolved" : "dismissed"} {fmt(i.closed_at)}{i.closed_by ? ` by ${i.closed_by}` : ""}</>}
        </div>
        {i.media_id && <a className="iss-photo" href={`/api/media/${i.media_id}`} target="_blank" rel="noopener"><img src={`/api/media/${i.media_id}`} alt="" /></a>}
        <div className="iss-acts">
          {isOpen && adj && i.status === "NEEDS_REVIEW" && (
            <>
              <select className="iss-sel" value={assign[i.id] || ""} onChange={(e) => setAssign((a) => ({ ...a, [i.id]: e.target.value }))} aria-label="Assign rework to">
                <option value="">Rework…</option>
                {crew.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button type="button" className="iss-btn" disabled={busy || !assign[i.id]} onClick={() => act(i, "assign", { assignTo: assign[i.id] })}>Assign</button>
              <button type="button" className="iss-btn ok" disabled={busy} onClick={() => act(i, "resolve")}>Resolve</button>
              <button type="button" className="iss-btn quiet" disabled={busy} onClick={() => act(i, "dismiss")}>Dismiss</button>
            </>
          )}
          {isOpen && i.status === "NEEDS_REWORK" && (mine || adj) && (
            <button type="button" className="iss-btn" disabled={busy} onClick={() => act(i, "fixed")}>Fixed</button>
          )}
          {isOpen && adj && i.status === "NEEDS_REWORK" && (
            <button type="button" className="iss-btn ok" disabled={busy} onClick={() => act(i, "resolve")}>Resolve</button>
          )}
          {!isOpen && adj && <button type="button" className="iss-btn quiet" disabled={busy} onClick={() => act(i, "reopen")}>Reopen</button>}
        </div>
      </div>
    );
  };

  return (
    <div className="iss-veil" onClick={(e) => { if (e.target.classList.contains("iss-veil")) onClose?.(); }}>
      <div className="iss-sheet" role="dialog" aria-label="Install issues">
        <div className="iss-head">
          <span className="iss-title">{mode === "new" ? "Flag" : "Issues"}{mode !== "new" && open.length ? <span className="iss-count">{open.length}</span> : null}</span>
          {mode !== "new" && canReport && <button type="button" className="iss-btn" onClick={() => setMode("new")}><Flag size={13} /> Flag</button>}
          <button type="button" className="iss-x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {err && <div className="iss-err">{err}</div>}
        {mode === "new" ? (
          <div className="iss-form">
            <select className="iss-sel wide" value={JSON.stringify(target)} onChange={(e) => setTarget(JSON.parse(e.target.value))} aria-label="What is the issue about">
              <option value={JSON.stringify({ kind: "order" })}>Whole work order</option>
              {items.map((it) => (
                <optgroup key={it.id} label={titleCase(it.name)}>
                  <option value={JSON.stringify({ kind: "item", id: it.id })}>{titleCase(it.name)}</option>
                  {stepsFor(it.type).map((s, k) => <option key={k} value={JSON.stringify({ kind: "step", id: it.id, stepIdx: k })}>— {s}</option>)}
                </optgroup>
              ))}
            </select>
            <select className="iss-sel wide" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
              {ISSUE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <textarea className="iss-ta" rows={3} placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="iss-row">
              <label className="iss-btn quiet iss-upl">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                {photo ? "Photo ✓" : "Photo"}
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              <span className="iss-spacer" />
              <button type="button" className="iss-btn quiet" onClick={() => setMode("list")}>Cancel</button>
              <button type="button" className="iss-btn primary" disabled={busy} onClick={submit}>{busy ? "…" : "Submit"}</button>
            </div>
          </div>
        ) : (
          <div className="iss-list">
            {open.length ? open.map(card) : <div className="iss-empty">No open issues</div>}
            {closed.length > 0 && (
              <button type="button" className="iss-more" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide" : "Show"} closed ({closed.length})</button>
            )}
            {showClosed && closed.map(card)}
          </div>
        )}
      </div>
    </div>
  );
}

// The work order's activity feed: claimed steps (from the install blob's stepLog) + flag lifecycle.
export function HistorySheet({ stepLog = [], issues = [], onClose }) {
  const rows = [];
  stepLog.forEach((e) => rows.push({ at: e.at, who: e.by, text: e.takeover ? `took over ${titleCase(e.name || "")}${e.from ? ` from ${e.from}` : ""}` : `${titleCase(e.name || "")} · ${e.step}` }));
  issues.forEach((i) => {
    const t = i.target_kind === "order" ? "work order" : i.target_label;
    rows.push({ at: i.created_at, who: i.raised_by, text: `flagged ${t} — ${i.reason}`, flag: true });
    if (i.assigned_to) rows.push({ at: i.updated_at, who: "office", text: `rework assigned to ${i.assigned_to} — ${t}`, flag: true });
    if (i.fixed_at) rows.push({ at: i.fixed_at, who: i.fixed_by, text: `marked fixed — ${t}`, flag: true });
    if (i.closed_at) rows.push({ at: i.closed_at, who: i.closed_by, text: `${i.status === "RESOLVED" ? "resolved" : "dismissed"} — ${t}`, flag: true });
  });
  const key = (r) => { try { return new Date(String(r.at || "").replace(" ", "T")).getTime() || 0; } catch { return 0; } };
  rows.sort((a, b) => key(b) - key(a));
  return (
    <div className="iss-veil" onClick={(e) => { if (e.target.classList.contains("iss-veil")) onClose?.(); }}>
      <div className="iss-sheet" role="dialog" aria-label="Work order history">
        <div className="iss-head"><span className="iss-title">History</span><button type="button" className="iss-x" onClick={onClose} aria-label="Close"><X /></button></div>
        <div className="iss-list">
          {rows.length ? rows.map((r, k) => (
            <div key={k} className={`iss-hrow${r.flag ? " flag" : ""}`}>
              <span className="iss-hwhen">{fmt(r.at)}</span>
              <span className="iss-htext"><b>{r.who || "—"}</b> {r.text}</span>
            </div>
          )) : <div className="iss-empty">No activity yet</div>}
        </div>
      </div>
    </div>
  );
}

export const ISSUE_CSS = `
.iss-flagbtn{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 9px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink-soft,#3A4048);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.74rem;font-weight:600}
.iss-flagbtn.has{color:var(--dv-red,#C4553D);border-color:#e6c4bc}
.iss-flagn{font-size:.72rem;font-weight:700}
.iss-veil{position:fixed;inset:0;z-index:80;background:rgba(16,20,24,.32);display:flex;justify-content:flex-end}
.iss-sheet{width:min(420px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-8px 0 32px -12px rgba(0,0,0,.35);font-family:inherit;color:var(--dv-ink,#101418)}
.iss-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.iss-title{flex:1;font-size:.95rem;font-weight:700;display:flex;align-items:center;gap:8px}
.iss-count{font-size:.7rem;font-weight:700;background:#fbe9e6;color:var(--dv-red,#C4553D);border-radius:100px;padding:2px 8px}
.iss-x{width:32px;height:32px;border:none;background:none;color:var(--dv-meta,#787D84);cursor:pointer;display:grid;place-items:center;border-radius:8px}
.iss-x:hover{background:var(--dv-paper,#F4F4F2)}
.iss-err{margin:10px 14px 0;font-size:.8rem;color:var(--dv-red,#C4553D);background:#fbe9e6;border:1px solid #e3b4ab;border-radius:8px;padding:8px 10px}
.iss-list{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.iss-empty{color:var(--dv-faint,#A1A6AC);font-size:.84rem;padding:18px 0;text-align:center}
.iss-card{border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--dv-raise,#FBFBFA)}
.iss-card.resolved,.iss-card.dismissed{opacity:.72}
.iss-card-top{display:flex;align-items:center;gap:8px}
.iss-target{flex:1;min-width:0;font-size:.86rem;font-weight:600}
.iss-pill{font-size:.66rem;font-weight:700;border-radius:100px;padding:3px 9px;white-space:nowrap;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.iss-pill.needs_review{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.iss-pill.needs_rework{background:#fdf0e6;color:#b45309}
.iss-pill.resolved{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.iss-reason{font-size:.82rem;color:var(--dv-ink-soft,#3A4048)}
.iss-note{color:var(--dv-meta,#787D84)}
.iss-meta{font-size:.72rem;color:var(--dv-meta,#787D84)}
.iss-photo img{max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--dv-line,#E4E4DF);display:block}
.iss-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.iss-acts:empty{display:none}
.iss-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);border-radius:8px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.iss-btn:disabled{opacity:.5;cursor:default}
.iss-btn.ok{color:var(--dv-green,#2E7D5B)}
.iss-btn.quiet{color:var(--dv-meta,#787D84)}
.iss-btn.primary{background:var(--dv-ink,#101418);color:#fff;border-color:var(--dv-ink,#101418)}
.iss-sel{height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;font-size:.8rem;font-family:inherit;padding:0 8px;color:var(--dv-ink,#101418)}
.iss-sel.wide{width:100%;height:38px}
.iss-form{padding:14px;display:flex;flex-direction:column;gap:10px}
.iss-ta{width:100%;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:8px 10px;font-size:.86rem;font-family:inherit;resize:vertical;outline:none}
.iss-ta:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.iss-row{display:flex;align-items:center;gap:8px}
.iss-spacer{flex:1}
.iss-upl{cursor:pointer}
.iss-more{align-self:center;background:none;border:none;color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit;padding:6px}
.iss-hrow{display:flex;gap:10px;font-size:.8rem;padding:6px 0;border-bottom:1px solid var(--dv-line-soft,#EDEDE9)}
.iss-hrow.flag .iss-htext{color:var(--dv-red,#C4553D)}
.iss-hwhen{flex:0 0 108px;color:var(--dv-meta,#787D84);font-size:.72rem;padding-top:2px}
.iss-htext{flex:1;min-width:0;color:var(--dv-ink-soft,#3A4048)}
/* Row overlay tag on the work order */
.icl-wstate{font-size:.66rem;font-weight:700;border-radius:100px;padding:2px 8px;margin-left:6px;vertical-align:1px;white-space:nowrap}
.icl-wstate.needs_review{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.icl-wstate.needs_rework{background:#fdf0e6;color:#b45309}
.icl-rowflag{width:28px;height:28px;border:none;background:none;color:var(--dv-faint,#A1A6AC);cursor:pointer;display:grid;place-items:center;border-radius:7px}
.icl-rowflag:hover{color:var(--dv-red,#C4553D);background:#fbe9e6}
.icl-owner{font-size:.72rem;color:var(--dv-meta,#787D84);margin:6px 0 8px}
.icl-owner b{color:var(--dv-ink,#101418)}
@media (max-width:767px){
  .iss-veil{align-items:flex-end;justify-content:stretch}
  .iss-sheet{width:100%;height:min(88vh,100%);border-radius:16px 16px 0 0;box-shadow:0 -8px 32px -12px rgba(0,0,0,.35)}
}
`;
