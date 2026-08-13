"use client";
import { useState, useEffect, useRef } from "react";
import { getNotesAction, addNoteAction, setNotePublicAction, getEventsAction } from "./proposal-actions";

// The Job Log — a per-project record with two halves:
//   • Activity: a timestamped trail — the inquiry, the milestones that carry a signature/approval
//     (submitted, approved, signed, reviewed, paid) from stage_acceptances, and logged events
//     like calls placed.
//   • Notes: internal (red) by default; staff can toggle a note public (blue) so the customer
//     sees it. A customer's own note is always public; customers only ever see public notes
//     (stripped server-side). Staff can @mention teammates.

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
  review: "var(--dv-blue,#3E6C9E)", pay: "var(--dv-green,#2E7D5B)", done: "var(--dv-green,#2E7D5B)",
  call: "var(--dv-gold-deep,#A8842F)", open: "var(--dv-faint,#A1A6AC)",
};

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
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function JobLog({ accessId, role, acceptances = {}, project, preview, staffUsers = [] }) {
  const isCust = role === "customer";
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState("");
  const [pub, setPub] = useState(false);   // compose visibility (staff choose; customer forced public)
  const [busy, setBusy] = useState(false);
  const [mq, setMq] = useState(null);      // active @mention query { token, start } | null
  const taRef = useRef(null);

  useEffect(() => {
    let live = true;
    getNotesAction(accessId).then((r) => { if (live && r?.ok) setNotes(r.notes || []); }).catch(() => {});
    if (!isCust) getEventsAction(accessId).then((r) => { if (live && r?.ok) setEvents(r.events || []); }).catch(() => {});
    return () => { live = false; };
  }, [accessId, isCust]);

  // Timeline: milestones (from acceptances) + logged events (calls…), newest first, then the
  // inquiry pinned at the bottom as the origin.
  const milestones = Object.entries(acceptances)
    .map(([stage, v]) => ({ verb: LOG_MAP[stage]?.verb, kind: LOG_MAP[stage]?.kind, at: v?.at, by: v?.by }))
    .filter((e) => e.verb && e.at);
  const evts = events.map((e) => ({ verb: e.label, kind: e.kind, at: e.created_at, by: e.actor }));
  const merged = [...milestones, ...evts].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const inqAt = project?.created_at || project?.date;
  const timeline = [...merged, ...(inqAt ? [{ verb: "Inquiry received", kind: "open", at: inqAt, by: null }] : [])];

  // ---- @mentions ----
  const mentionMatches = mq
    ? staffUsers.filter((u) => u.name && u.name.toLowerCase().includes(mq.token.toLowerCase())).slice(0, 6)
    : [];
  function onDraft(e) {
    const v = e.target.value, caret = e.target.selectionStart ?? v.length;
    setDraft(v);
    const m = v.slice(0, caret).match(/@([A-Za-z]{0,24})$/);
    setMq(m ? { token: m[1], start: caret - m[0].length } : null);
  }
  function pickMention(u) {
    const caret = taRef.current?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, mq.start)}@${u.name} ${draft.slice(caret)}`;
    setDraft(next); setMq(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }
  // Wrap "@Name" (known staff) in a highlight span when rendering a note body.
  const names = staffUsers.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length);
  function renderBody(body) {
    if (!names.length || !body.includes("@")) return body;
    const re = new RegExp(`@(${names.map(escRe).join("|")})`, "g");
    const out = []; let last = 0, m;
    while ((m = re.exec(body))) {
      if (m.index > last) out.push(body.slice(last, m.index));
      out.push(<span className="jl-mention" key={m.index}>{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  }

  async function send() {
    if (busy || preview || !draft.trim()) return;
    setBusy(true);
    const r = await addNoteAction(accessId, draft.trim(), isCust ? true : pub);
    setBusy(false);
    if (r?.ok) { setNotes(r.notes); setDraft(""); setMq(null); }
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
          <div className="jl-empty">No activity yet. The inquiry, calls, and every signed or reviewed milestone appear here.</div>
        ) : (
          <ol className="jl-time">
            {timeline.map((e, i) => (
              <li className="jl-ev" key={i}>
                <span className="jl-dot" style={{ background: KIND_COLOR[e.kind] || "var(--dv-faint)" }} />
                <div className="jl-ev-main">
                  <span className="jl-ev-verb">{e.verb}</span>
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
            <div className="jl-ta-wrap">
              <textarea ref={taRef} className="jl-input" rows={2} value={draft} placeholder="Add a note…  @ to mention"
                onChange={onDraft} onBlur={() => setTimeout(() => setMq(null), 120)} />
              {mentionMatches.length > 0 && (
                <div className="jl-mdd">
                  {mentionMatches.map((u) => (
                    <button key={u.email || u.name} type="button" className="jl-mopt" onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}>
                      <span className="jl-mopt-name">{u.name}</span>
                      {u.role && <span className="jl-mopt-role">{u.role}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="jl-compose-foot">
              {isCust ? (
                <span className="jl-vis-note">Your notes are shared with the team.</span>
              ) : (
                <button type="button" className={`jl-vis-tog ${pub ? "pub" : "int"}`} onClick={() => setPub((v) => !v)}
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
                <div className="jl-note-body">{renderBody(n.body)}</div>
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
.jl-ta-wrap{position:relative}
.jl-input{width:100%;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);padding:11px 13px;font-size:13.5px;font-family:inherit;outline:none;resize:vertical}
.jl-input:focus{border-color:var(--dv-gold,#C9A96E)}
.jl-mdd{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:20;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;box-shadow:0 12px 30px rgba(16,20,24,.12);padding:4px;max-height:210px;overflow-y:auto}
.jl-mopt{width:100%;display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:7px;text-align:left;cursor:pointer}
.jl-mopt:hover{background:var(--dv-paper,#F4F4F2)}
.jl-mopt-name{font-size:13.5px;font-weight:500}
.jl-mopt-role{font-size:11px;color:var(--dv-meta,#787D84);text-transform:capitalize;margin-left:auto}
.jl-compose-foot{display:flex;align-items:center;gap:10px;margin-top:9px}
.jl-vis-tog{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);font-size:12.5px;font-weight:500;cursor:pointer}
.jl-vis-dot{width:7px;height:7px;border-radius:99px;background:currentColor}
.jl-vis-tog.int{border-color:#e3b4ab;color:#b23b28}
.jl-vis-tog.pub{border-color:#aec6e2;color:#2f5c8f}
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
.jl-badge.int{background:#fbe9e6;color:#b23b28}
.jl-badge.pub{background:#e9f0f8;color:#2f5c8f}
.jl-badge.tog{cursor:pointer}
.jl-note-body{font-size:14px;line-height:1.5;white-space:pre-wrap}
.jl-mention{color:#2f5c8f;font-weight:600}
@media (max-width:720px){.jl{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.jl-notes-col{border-left:none;border-top:1px solid var(--dv-line,#E4E4DF)}}
`;
