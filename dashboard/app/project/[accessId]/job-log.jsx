"use client";
import { useState, useEffect } from "react";
import { getNotesAction, addNoteAction, setNotePublicAction } from "./proposal-actions";

// The Job Log — a per-project record with two halves:
//   • Activity: a timestamped trail of the milestones that carry a signature/approval
//     (submitted, approved, signed, reviewed, paid), sourced from stage_acceptances.
//   • Notes: internal by default; staff can toggle a note public so the customer sees it.
//     A customer's own note is always public and they only ever see public notes (stripped
//     server-side in getNotesAction).

// stage_acceptances key → how it reads in the log.
const LOG_MAP = {
  submit_site_survey: { verb: "Site survey submitted to customer", kind: "submit" },
  site_survey:        { verb: "Site survey approved",              kind: "approve" },
  submit_mockup:      { verb: "Mockups submitted to customer",     kind: "submit" },
  mockup:             { verb: "Mockups approved",                  kind: "approve" },
  proposal:           { verb: "Proposal signed",                   kind: "sign" },
  approval_deposit:   { verb: "Proposal approved & deposit paid",  kind: "sign" },
  qc:                 { verb: "Quality control reviewed",          kind: "review" },
  payment:            { verb: "Final payment received",            kind: "pay" },
  completion:         { verb: "Project completed",                 kind: "done" },
};
const KIND_COLOR = {
  submit: "var(--dv-blue,#3E6C9E)", approve: "var(--dv-green,#2E7D5B)", sign: "var(--dv-gold-deep,#A8842F)",
  review: "var(--dv-blue,#3E6C9E)", pay: "var(--dv-green,#2E7D5B)", done: "var(--dv-green,#2E7D5B)", open: "var(--dv-faint,#A1A6AC)",
};

// "2026-08-14 10:30:00" → "Aug 14 · 10:30 AM" (no Date parsing — avoids TZ surprises).
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtTs(s) {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return "";
  const [, , mo, d, hh, mm] = m;
  const day = `${MON[(+mo || 1) - 1]} ${+d}`;
  if (hh == null) return day;
  let h = +hh; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${day} · ${h}:${mm} ${ap}`;
}

export default function JobLog({ accessId, role, acceptances = {}, project, preview }) {
  const isCust = role === "customer";
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [pub, setPub] = useState(false);   // compose visibility (staff choose; customer forced public)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getNotesAction(accessId).then((r) => { if (live && r?.ok) setNotes(r.notes || []); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  // Build the activity trail from the acceptance timestamps, newest first, with the project's
  // open date pinned at the bottom as the origin.
  const events = Object.entries(acceptances)
    .map(([stage, v]) => ({ stage, at: v?.at, by: v?.by, meta: LOG_MAP[stage] }))
    .filter((e) => e.meta && e.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const opened = project?.date ? { stage: "opened", at: `${project.date} 00:00:00`, by: null, meta: { verb: "Project opened", kind: "open" } } : null;
  const timeline = [...events, ...(opened ? [opened] : [])];

  async function send() {
    if (busy || preview || !draft.trim()) return;
    setBusy(true);
    const r = await addNoteAction(accessId, draft.trim(), isCust ? true : pub);
    setBusy(false);
    if (r?.ok) { setNotes(r.notes); setDraft(""); }
  }
  async function toggle(n) {
    if (preview || isCust) return;
    const r = await setNotePublicAction(accessId, n.id, !n.public);
    if (r?.ok) setNotes(r.notes);
  }

  return (
    <div className="jl">
      <style>{CSS}</style>

      {/* ---- Activity ---- */}
      <section className="jl-col">
        <div className="jl-head mono">Activity</div>
        {timeline.length === 0 ? (
          <div className="jl-empty">No activity yet. Milestones appear here as they’re signed and reviewed.</div>
        ) : (
          <ol className="jl-time">
            {timeline.map((e, i) => (
              <li className="jl-ev" key={`${e.stage}-${i}`}>
                <span className="jl-dot" style={{ background: KIND_COLOR[e.meta.kind] || "var(--dv-faint)" }} />
                <div className="jl-ev-main">
                  <span className="jl-ev-verb">{e.meta.verb}</span>
                  {e.by && <span className="jl-ev-by">by {e.by}</span>}
                </div>
                <span className="jl-ev-ts mono">{fmtTs(e.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---- Notes ---- */}
      <section className="jl-col jl-notes-col">
        <div className="jl-head mono">Notes</div>

        {!preview && (
          <div className="jl-compose">
            <textarea className="jl-input" rows={2} value={draft} placeholder="Add a note…"
              onChange={(e) => setDraft(e.target.value)} />
            <div className="jl-compose-foot">
              {isCust ? (
                <span className="jl-vis-note">Your notes are shared with the team.</span>
              ) : (
                <button type="button" className={`jl-vis-tog ${pub ? "on" : ""}`} onClick={() => setPub((v) => !v)}
                  title="Internal notes stay with the team; public notes are shown to the customer.">
                  <span className="jl-vis-dot" />{pub ? "Public" : "Internal"}
                </button>
              )}
              <button className="jl-send" disabled={busy || !draft.trim()} onClick={send}>Add</button>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <div className="jl-empty">No notes yet.</div>
        ) : (
          <ul className="jl-list">
            {notes.map((n) => (
              <li className="jl-note" key={n.id}>
                <div className="jl-note-top">
                  <span className={`jl-who ${n.author_role === "customer" ? "cust" : "staff"}`}>{n.author_name || n.author_role || "—"}</span>
                  <span className="jl-note-ts mono">{fmtTs(n.created_at)}</span>
                  {n.author_role === "customer" || isCust ? (
                    <span className={`jl-badge ${n.public ? "pub" : "int"}`}>{n.public ? "Public" : "Internal"}</span>
                  ) : (
                    <button className={`jl-badge tog ${n.public ? "pub" : "int"}`} onClick={() => toggle(n)}
                      title="Toggle whether the customer can see this note">{n.public ? "Public" : "Internal"}</button>
                  )}
                </div>
                <div className="jl-note-body">{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const CSS = `
.jl{height:100%;display:grid;grid-template-columns:1fr 1fr;gap:0;color:var(--dv-ink,#101418);font-family:var(--font-sans),system-ui,sans-serif}
.jl .mono{font-family:var(--font-mono,"JetBrains Mono"),ui-monospace,monospace}
.jl-col{min-height:0;overflow-y:auto;padding:22px 26px;scrollbar-width:none}
.jl-col::-webkit-scrollbar{width:0;display:none}
.jl-notes-col{border-left:1px solid var(--dv-line,#E4E4DF)}
.jl-head{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:16px}
.jl-empty{font-size:13.5px;color:var(--dv-faint,#A1A6AC);line-height:1.5;max-width:34ch}
/* timeline */
.jl-time{list-style:none;display:flex;flex-direction:column;gap:2px;position:relative}
.jl-ev{display:flex;align-items:baseline;gap:12px;padding:9px 0;position:relative}
.jl-ev::before{content:'';position:absolute;left:4px;top:22px;bottom:-9px;width:1px;background:var(--dv-line,#E4E4DF)}
.jl-ev:last-child::before{display:none}
.jl-dot{width:9px;height:9px;border-radius:99px;flex:0 0 auto;position:relative;z-index:1;margin-top:2px}
.jl-ev-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.jl-ev-verb{font-size:14px;font-weight:500;letter-spacing:-.01em}
.jl-ev-by{font-size:12px;color:var(--dv-meta,#787D84)}
.jl-ev-ts{font-size:11px;color:var(--dv-faint,#A1A6AC);white-space:nowrap;flex:0 0 auto}
/* compose */
.jl-compose{margin-bottom:18px}
.jl-input{width:100%;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);padding:11px 13px;font-size:13.5px;font-family:inherit;outline:none;resize:vertical}
.jl-input:focus{border-color:var(--dv-gold,#C9A96E)}
.jl-compose-foot{display:flex;align-items:center;gap:10px;margin-top:9px}
.jl-vis-tog{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:12.5px;font-weight:500;cursor:pointer}
.jl-vis-dot{width:7px;height:7px;border-radius:99px;background:var(--dv-faint,#A1A6AC)}
.jl-vis-tog.on{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.jl-vis-tog.on .jl-vis-dot{background:var(--dv-gold-deep,#A8842F)}
.jl-vis-note{flex:1;font-size:12px;color:var(--dv-faint,#A1A6AC)}
.jl-send{margin-left:auto;height:32px;padding:0 18px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:13px;font-weight:500;cursor:pointer}
.jl-send:disabled{opacity:.4;cursor:default}
/* notes list */
.jl-list{list-style:none;display:flex;flex-direction:column;gap:14px}
.jl-note{border-bottom:1px solid var(--dv-line-soft,#EDEDE9);padding-bottom:13px}
.jl-note:last-child{border-bottom:none}
.jl-note-top{display:flex;align-items:center;gap:9px;margin-bottom:5px}
.jl-who{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 9px;border-radius:100px;white-space:nowrap}
.jl-who.cust{background:#F3E9D3;color:#8a6d2f}.jl-who.staff{background:#e9ebf2;color:#3a4a72}
.jl-note-ts{font-size:11px;color:var(--dv-faint,#A1A6AC);margin-right:auto}
.jl-badge{font-size:10.5px;font-weight:600;letter-spacing:.02em;padding:3px 9px;border-radius:100px;border:1px solid transparent}
.jl-badge.int{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.jl-badge.pub{background:#eef7f0;color:#1d5a2e}
.jl-badge.tog{cursor:pointer}
.jl-note-body{font-size:14px;line-height:1.5;white-space:pre-wrap}
@media (max-width:720px){.jl{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.jl-notes-col{border-left:none;border-top:1px solid var(--dv-line,#E4E4DF)}}
`;
