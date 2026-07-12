"use client";

import { useState, useEffect } from "react";
import { addSurveyNoteAction, getSurveyNotesAction } from "./proposal-actions";

// The survey is read-only for the customer — they can't move or remove anything. Instead they
// leave quick notes ("move the back-door camera", "remove this one") that staff act on. Staff
// see the same thread so they know what to change before re-submitting.
export default function SurveyComments({ accessId, role, preview }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const isCustomer = role === "customer";

  useEffect(() => {
    let live = true;
    getSurveyNotesAction(accessId).then((r) => { if (live && r?.notes) setNotes(r.notes); });
    return () => { live = false; };
  }, [accessId]);

  async function submit() {
    const t = text.trim();
    if (!t || busy || preview) return;
    setBusy(true);
    const r = await addSurveyNoteAction(accessId, t);
    setBusy(false);
    if (r?.ok) { setNotes(r.notes); setText(""); }
  }

  // Staff with no customer notes: nothing to show (render only when real).
  if (!isCustomer && notes.length === 0) return null;

  const fmt = (s) => { try { return new Date(String(s).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };

  return (
    <div className="svc">
      <div className="svc-lbl">
        {isCustomer ? "Want something changed? Leave a note — we'll update the survey." : "Customer notes on this survey"}
      </div>

      {isCustomer && (
        <div className="svc-row">
          <input
            className="svc-in"
            placeholder="e.g. Move the back-door camera closer to the gate"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            disabled={preview}
          />
          <button className="svc-btn" onClick={submit} disabled={busy || preview || !text.trim()}>{busy ? "…" : "Send"}</button>
        </div>
      )}
      {preview && isCustomer && <div className="svc-preview">Notes are disabled in preview.</div>}

      {notes.length > 0 && (
        <div className="svc-list">
          {notes.map((n) => (
            <div className="svc-note" key={n.id}>
              <span className={`svc-who${n.author_role === "customer" ? " cust" : ""}`}>{n.author_name || n.author_role || "—"}</span>
              <span className="svc-body">{n.body}</span>
              {n.created_at && <span className="svc-when">{fmt(n.created_at)}</span>}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .svc{margin-top:10px;border:1px solid var(--line,#d9d4ca);border-radius:10px;background:#fff;padding:12px 14px}
        .svc-lbl{font-size:.82rem;font-weight:700;color:#0B0F1A;margin-bottom:9px}
        .svc-row{display:flex;gap:8px}
        .svc-in{flex:1;min-width:0;height:38px;border:1px solid var(--line,#d9d4ca);border-radius:9px;padding:0 12px;font-size:.84rem;font-family:inherit;outline:none;background:var(--bg-soft,#f6f7f9)}
        .svc-in:focus{border-color:#C9A96E;background:#fff}
        .svc-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
        .svc-btn:disabled{opacity:.5;cursor:default}
        .svc-preview{margin-top:6px;font-size:.72rem;color:var(--muted,#6f7686)}
        .svc-list{margin-top:11px;display:flex;flex-direction:column;gap:8px}
        .svc-note{display:flex;align-items:baseline;gap:9px;font-size:.82rem;padding-top:8px;border-top:1px solid var(--line,#eee)}
        .svc-note:first-child{border-top:none;padding-top:0}
        .svc-who{font-weight:700;color:#6f7686;flex-shrink:0}
        .svc-who.cust{color:#4b6a9b}
        .svc-body{flex:1;color:#0B0F1A;line-height:1.4}
        .svc-when{font-size:.72rem;color:var(--muted,#9aa1b3);flex-shrink:0}
      `}</style>
    </div>
  );
}
