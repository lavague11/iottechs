"use client";
import { useState, useEffect, useRef } from "react";
import { getNotesAction, addNoteAction, setNoteVisibilityAction, resolveNotePublicAction, getEventsAction } from "./proposal-actions";

// The Job Log — a per-project record with two halves:
//   • Activity: a timestamped trail — the inquiry, the milestones that carry a signature/approval
//     (submitted, approved, signed, reviewed, paid) from stage_acceptances, and logged events
//     like calls placed.
//   • Notes: internal (red) by default; staff can toggle a note public (blue) so the customer
//     sees it. A customer's own note is always public; customers only ever see public notes
//     (stripped server-side). Staff can @mention teammates.

const LOG_MAP = {
  // submit_site_survey / submit_mockup are logged as project_events (with resubmit + camera
  // count), so they're intentionally NOT mapped here — that would double them.
  site_survey:        { verb: "Site survey approved",              kind: "approve" },
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
// A tool comment is tagged with the surface it came from + the item it was tapped on (e.g. a mockup
// camera). Surface the tool + item so a note like "TOO FAR" reads against the camera it's about.
const SCOPE_LABEL = { survey: "Site Survey", mockup: "Mockup", portal: "Portal" };
function anchorLabel(n) {
  return [SCOPE_LABEL[n.scope], n.anchor].filter(Boolean).join(" · ");
}

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
// Forensic events show only in the staff "Advanced" view; milestones/inquiry are in Basic too.
const ADVANCED_KINDS = new Set(["call", "login", "view", "change", "resubmit"]);
const SearchIco = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;

export default function JobLog({ accessId, role, acceptances = {}, project, preview, staffUsers = [] }) {
  const isCust = role === "customer";
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState("");
  const [pub, setPub] = useState(false);   // compose visibility (staff choose; customer forced public)
  const [busy, setBusy] = useState(false);
  const [mq, setMq] = useState(null);      // active @mention query { token, start } | null
  const [mode, setMode] = useState("basic"); // staff: basic milestones vs advanced forensics
  const [confirmId, setConfirmId] = useState(null);   // note id awaiting an inline visibility confirm
  const [actQ, setActQ] = useState(null);             // activity search string (null = closed)
  const [noteQ, setNoteQ] = useState(null);           // notes search string (null = closed)
  const [expanded, setExpanded] = useState(() => new Set());  // note ids shown full-height
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
  const full = [...merged, ...(inqAt ? [{ verb: "Inquiry received", kind: "open", at: inqAt, by: null }] : [])];
  // Basic = milestones + inquiry (customer-safe); Advanced (staff) adds forensic events.
  const advanced = !isCust && mode === "advanced";
  let timeline = advanced ? full : full.filter((e) => !ADVANCED_KINDS.has(e.kind));
  if (actQ) timeline = timeline.filter((e) => `${e.verb} ${e.by || ""}`.toLowerCase().includes(actQ.toLowerCase()));
  const shownNotes = noteQ ? notes.filter((n) => `${n.body} ${n.author_name || ""}`.toLowerCase().includes(noteQ.toLowerCase())) : notes;
  const toggleExpand = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
  const isAdminMgr = ["admin", "manager"].includes(role);
  const isStaff = ["admin", "manager", "sales", "tech"].includes(role);
  async function applyVisibility(n) {   // internal → public (admin/mgr) or → pending request (tech/sales)
    const r = await setNoteVisibilityAction(accessId, n.id, !n.public);
    if (r?.ok) setNotes(r.notes);
    setConfirmId(null);
  }
  async function resolvePending(n, approve) {   // admin/mgr decide a pending request
    const r = await resolveNotePublicAction(accessId, n.id, approve);
    if (r?.ok) setNotes(r.notes);
    setConfirmId(null);
  }
  // The visibility control for one note — plain badge, clickable badge, pending chip, or an
  // inline "are you sure?" confirm, depending on role and state.
  function renderBadge(n) {
    const plain = <span className={`jl-badge ${n.public ? "pub" : "int"}`}>{n.public ? "Public" : "Internal"}</span>;
    if (isCust || n.author_role === "customer" || preview) return plain;   // no control
    if (confirmId === n.id) {
      const pending = !!n.pending_public;
      const q = pending ? "Approve?" : n.public ? "Make internal?" : isAdminMgr ? "Make public?" : "Request public?";
      return (
        <span className="jl-confirm">
          <span className="jl-cq">{q}</span>
          <button className="jl-cy" title="Yes" onClick={pending ? () => resolvePending(n, true) : () => applyVisibility(n)}>✓</button>
          <button className="jl-cn" title={pending ? "Reject" : "Cancel"} onClick={pending ? () => resolvePending(n, false) : () => setConfirmId(null)}>✕</button>
        </span>
      );
    }
    if (n.pending_public) {
      return isAdminMgr
        ? <button className="jl-badge pend" title="Approve or reject" onClick={() => setConfirmId(n.id)}>Pending</button>
        : <span className="jl-badge pend">Pending</span>;
    }
    const clickable = isAdminMgr || (isStaff && !n.public);   // admin/mgr always; tech/sales only request public
    return clickable
      ? <button className={`jl-badge tog ${n.public ? "pub" : "int"}`} title="Change visibility" onClick={() => setConfirmId(n.id)}>{n.public ? "Public" : "Internal"}</button>
      : plain;
  }

  return (
    <div className="jl">
      <style>{CSS}</style>

      {/* ---- Activity ---- */}
      <section className="jl-col">
        <div className="jl-head-row">
          <div className="jl-head mono">Activity</div>
          <div className="jl-tools">
            <button className={`jl-icbtn ${actQ != null ? "on" : ""}`} title="Search activity" onClick={() => setActQ((q) => (q == null ? "" : null))}><SearchIco /></button>
            {!isCust && (
              <button className={`jl-modetog ${advanced ? "adv" : ""}`} onClick={() => setMode((m) => (m === "basic" ? "advanced" : "basic"))}
                title="Toggle basic ↔ advanced (forensic) activity">
                <span className="jl-mdot" />{advanced ? "Advanced" : "Basic"}
              </button>
            )}
          </div>
        </div>
        {actQ != null && <input className="jl-search" autoFocus value={actQ} onChange={(e) => setActQ(e.target.value)} placeholder="Search activity…" />}
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
        <div className="jl-head-row">
          <div className="jl-head mono">Notes</div>
          <button className={`jl-icbtn ${noteQ != null ? "on" : ""}`} title="Search notes" onClick={() => setNoteQ((q) => (q == null ? "" : null))}><SearchIco /></button>
        </div>
        {noteQ != null && <input className="jl-search" autoFocus value={noteQ} onChange={(e) => setNoteQ(e.target.value)} placeholder="Search notes…" />}

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

        {shownNotes.length === 0 ? (
          <div className="jl-empty">{noteQ ? "No notes match." : "No notes yet."}</div>
        ) : (
          <ul className="jl-list">
            {shownNotes.map((n) => (
              <li className="jl-note" key={n.id}>
                <div className="jl-note-top">
                  <span className={`jl-who ${n.author_role === "customer" ? "cust" : "staff"}`}>{n.author_name || n.author_role || "—"}</span>
                  <span className="jl-note-ts mono">{fmtTs(n.created_at)}</span>
                  {renderBadge(n)}
                </div>
                {anchorLabel(n) && (
                  <div className="jl-note-anchor">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    {anchorLabel(n)}
                  </div>
                )}
                <div className={`jl-note-body ${expanded.has(n.id) ? "open" : ""}`} onClick={() => toggleExpand(n.id)} title="Click to expand / collapse">{renderBody(n.body)}</div>
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
.jl-head{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.jl-head-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px}
.jl-modetog{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:99px;font-size:12px;font-weight:600;color:var(--dv-meta,#787D84);background:var(--dv-raise,#FBFBFA)}
.jl-modetog .jl-mdot{width:7px;height:7px;border-radius:99px;background:var(--dv-faint,#A1A6AC);transition:background .15s}
.jl-modetog.adv{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.jl-modetog.adv .jl-mdot{background:var(--dv-gold-deep,#A8842F)}
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
.jl-badge.pend{background:#fbf0dc;color:#96631a;border-color:#e7cf9e;cursor:pointer}
.jl-confirm{display:inline-flex;align-items:center;gap:6px}
.jl-cq{font-size:11px;font-weight:600;color:var(--dv-ink,#101418)}
.jl-cy,.jl-cn{width:22px;height:22px;border-radius:6px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dv-line,#E4E4DF)}
.jl-cy{background:#e9f0f8;color:#2f5c8f;border-color:#aec6e2}
.jl-cn{background:#fbe9e6;color:#b23b28;border-color:#e3b4ab}
.jl-badge.tog{cursor:pointer}
.jl-note-anchor{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--dv-gold-deep,#A8842F);background:#F7EFDD;border-radius:100px;padding:2px 9px;margin-bottom:6px}
.jl-note-anchor svg{flex:0 0 auto}
.jl-note-body{font-size:14px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.jl-note-body.open{white-space:pre-wrap;overflow:visible}
.jl-tools{display:inline-flex;align-items:center;gap:8px}
.jl-icbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:99px;color:var(--dv-meta,#787D84);background:var(--dv-raise,#FBFBFA)}
.jl-icbtn:hover,.jl-icbtn.on{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.jl-search{width:100%;height:34px;margin-bottom:14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);padding:0 12px;font-size:13px;font-family:inherit;outline:none}
.jl-search:focus{border-color:var(--dv-gold,#C9A96E)}
.jl-mention{color:#2f5c8f;font-weight:600}
@media (max-width:720px){.jl{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.jl-notes-col{border-left:none;border-top:1px solid var(--dv-line,#E4E4DF)}}
`;
