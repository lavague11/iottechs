"use client";

import { useState, useEffect, useCallback } from "react";
import { addToolNoteAction, getToolNotesAction } from "./proposal-actions";

// Customer read-only comment thread for a tool (survey / mockup / portal). The customer can't edit
// the tool — tapping an item opens a small toast to leave a comment TAGGED to that item (anchor,
// e.g. "Camera 3"). Staff see the whole thread grouped by item so they know what to change. This is
// the customer's ONLY write on these surfaces (see the customer-readonly-comment rule).
//
// Props: accessId, scope ("survey"|"mockup"|"portal"), role, preview, anchor (the tapped item or
// null), onClose. When `anchor` is set the add-toast pops; the grouped thread list always renders
// (only when there ARE comments) so staff can act on them.
export default function ToolComments({ accessId, scope, role, preview, anchor, onClose }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [genText, setGenText] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const isCustomer = role === "customer";

  const load = useCallback(() => {
    getToolNotesAction(accessId, scope).then((r) => { if (r?.notes) setNotes(r.notes); }).catch(() => {});
  }, [accessId, scope]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setText(""); }, [anchor]);

  async function submit() {
    const t = text.trim();
    if (!t || busy || preview) return;
    setBusy(true);
    const r = await addToolNoteAction(accessId, scope, anchor != null ? String(anchor) : null, t);
    setBusy(false);
    if (r?.ok) { setNotes(r.notes); setText(""); }
  }
  // A general (un-anchored) comment — the always-on box, so the customer can leave a note that isn't
  // about one specific item.
  async function submitGeneral() {
    const t = genText.trim();
    if (!t || genBusy || preview) return;
    setGenBusy(true);
    const r = await addToolNoteAction(accessId, scope, null, t);
    setGenBusy(false);
    if (r?.ok) { setNotes(r.notes); setGenText(""); }
  }

  const fmt = (s) => { try { return new Date(String(s).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };

  // Grouped thread (for the always-on list): anchor → notes.
  const groups = [];
  notes.forEach((n) => {
    const key = (n.anchor || "").trim() || "General";
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, notes: [] }; groups.push(g); }
    g.notes.push(n);
  });
  const activeThread = anchor != null ? notes.filter((n) => (n.anchor || "") === String(anchor)) : [];

  // Nothing to show for a STAFF viewer with no thread open and no comments yet. The customer always
  // gets the general comment box (their way to leave a note that isn't about one specific item).
  if (anchor == null && groups.length === 0 && !(isCustomer && !preview)) return null;

  return (
    <>
      {/* Tap toast — anchored comment composer for the tapped item */}
      {anchor != null && (
        <div className="tc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <div className="tc-card" role="dialog" aria-label={`Comment on ${anchor}`}>
            <div className="tc-head">
              <span className="tc-anchor">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                {String(anchor)}
              </span>
              <button className="tc-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            {activeThread.length > 0 && (
              <div className="tc-list">
                {activeThread.map((n) => (
                  <div className="tc-note" key={n.id}>
                    <span className={`tc-who${n.author_role === "customer" ? " cust" : ""}`}>{n.author_name || n.author_role || "—"}</span>
                    <span className="tc-body">{n.body}</span>
                    {n.created_at && <span className="tc-when">{fmt(n.created_at)}</span>}
                  </div>
                ))}
              </div>
            )}
            {!preview ? (
              <div className="tc-row">
                <input className="tc-in" autoFocus placeholder={`Leave a comment on ${anchor}…`} value={text} maxLength={2000}
                  onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
                <button className="tc-btn" onClick={submit} disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</button>
              </div>
            ) : <div className="tc-preview">Comments are disabled in preview.</div>}
          </div>
        </div>
      )}

      {/* Always-on grouped thread — staff (and the customer) see what's been said, by item; the
          customer gets a general comment box for notes that aren't about one specific item. */}
      {(groups.length > 0 || (isCustomer && !preview)) && (
        <div className="tc-thread">
          <div className="tc-thread-lbl">{isCustomer ? "Comments" : "Customer comments"}</div>
          {groups.map((g) => (
            <div className="tc-group" key={g.key}>
              <div className="tc-group-h">{g.key}</div>
              {g.notes.map((n) => (
                <div className="tc-note" key={n.id}>
                  <span className={`tc-who${n.author_role === "customer" ? " cust" : ""}`}>{n.author_name || n.author_role || "—"}</span>
                  <span className="tc-body">{n.body}</span>
                  {n.created_at && <span className="tc-when">{fmt(n.created_at)}</span>}
                </div>
              ))}
            </div>
          ))}
          {isCustomer && !preview && (
            <div className="tc-row" style={{ marginTop: groups.length ? 11 : 2 }}>
              <input className="tc-in" placeholder="Leave a comment…" value={genText} maxLength={2000}
                onChange={(e) => setGenText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitGeneral(); }} />
              <button className="tc-btn" onClick={submitGeneral} disabled={genBusy || !genText.trim()}>{genBusy ? "…" : "Send"}</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .tc-overlay{position:fixed;inset:0;z-index:10001;background:rgba(16,17,18,.4);display:flex;align-items:center;justify-content:center;padding:18px}
        .tc-card{width:min(420px,100%);background:var(--dv-raise,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;box-shadow:0 24px 60px rgba(16,17,18,.32);padding:14px 16px;animation:tcpop .16s cubic-bezier(.2,.8,.2,1)}
        @keyframes tcpop{from{transform:scale(.96);opacity:.5}to{transform:scale(1);opacity:1}}
        .tc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .tc-anchor{display:inline-flex;align-items:center;gap:7px;font-size:.9rem;font-weight:700;color:var(--dv-ink,#101418)}
        .tc-anchor svg{color:var(--dv-gold-deep,#8a6d2f)}
        .tc-x{border:none;background:none;color:var(--dv-meta,#787D84);font-size:16px;cursor:pointer;line-height:1;padding:4px}
        .tc-row{display:flex;gap:8px}
        .tc-in{flex:1;min-width:0;height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:0 12px;font-size:.84rem;font-family:inherit;outline:none;background:var(--dv-paper,#F4F4F2)}
        .tc-in:focus{border-color:var(--dv-gold,#C9A96E);background:var(--dv-raise,#FBFBFA)}
        .tc-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
        .tc-btn:disabled{opacity:.5;cursor:default}
        .tc-preview{font-size:.74rem;color:var(--dv-meta,#787D84)}
        .tc-list{margin-bottom:10px;display:flex;flex-direction:column;gap:7px;max-height:180px;overflow-y:auto}
        .tc-thread{margin-top:10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);padding:12px 14px}
        .tc-thread-lbl{font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418);margin-bottom:9px}
        .tc-group+.tc-group{margin-top:10px;padding-top:10px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
        .tc-group-h{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-gold-deep,#8a6d2f);margin-bottom:5px}
        .tc-note{display:flex;align-items:baseline;gap:9px;font-size:.82rem;padding:3px 0}
        .tc-who{font-weight:600;color:var(--dv-meta,#787D84);flex-shrink:0}
        .tc-who.cust{color:var(--dv-blue,#3E6C9E)}
        .tc-body{flex:1;color:var(--dv-ink,#101418);line-height:1.4}
        .tc-when{font-size:.72rem;color:var(--dv-faint,#A1A6AC);flex-shrink:0}
      `}</style>
    </>
  );
}
