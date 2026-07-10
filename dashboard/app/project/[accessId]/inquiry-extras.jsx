"use client";
import { useState, useEffect } from "react";
import { getNotesAction, addNoteAction, setPocAction } from "./proposal-actions";

// Inquiry-stage extras: the appointment point-of-contact (who'll be on site if not the
// customer) and a lightweight notes thread where the customer or our team can add details,
// questions, or extra information before the survey visit.
export default function InquiryExtras({ accessId, project, role, preview }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [poc, setPoc] = useState({ name: project?.poc_name || "", phone: project?.poc_phone || "" });
  const [pocSaved, setPocSaved] = useState(!!project?.poc_name);
  const [pocEdit, setPocEdit] = useState(!project?.poc_name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    getNotesAction(accessId).then((r) => { if (live && r?.ok) setNotes(r.notes || []); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  async function savePoc() {
    if (busy || preview) return;
    setBusy(true); setErr(null);
    const r = await setPocAction(accessId, poc);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setPocSaved(!!poc.name); setPocEdit(false);
  }
  async function sendNote() {
    if (busy || preview || !draft.trim()) return;
    setBusy(true); setErr(null);
    const r = await addNoteAction(accessId, draft);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setNotes(r.notes); setDraft("");
  }

  return (
    <div className="pv-tool-panel" style={{ "--tool-c": "#6FBF73" }}>
      <div className="pv-tool-head" style={{ cursor: "default" }}>
        <span className="pv-tool-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span className="pv-tool-title">Details &amp; Notes</span>
        <span className="pv-tool-sub">Point of contact · Extra info · Questions</span>
        {notes.length > 0 && <span className="pv-tool-chip">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>}
      </div>
      <div className="pv-tool-body">
        <style>{IEX_CSS}</style>
        {err && <div className="iex-err">{err}</div>}

        {/* Point of contact for the appointment */}
        <div className="iex-lbl">Appointment Point of Contact</div>
        {pocSaved && !pocEdit ? (
          <div className="iex-poc-saved">
            <span className="iex-poc-name">{poc.name}</span>
            {poc.phone && <span className="iex-poc-phone">{poc.phone}</span>}
            {!preview && <button className="iex-link" onClick={() => setPocEdit(true)}>Edit</button>}
          </div>
        ) : (
          <div className="iex-poc-form">
            <input className="iex-input" placeholder="Name (if someone else will be on site)" value={poc.name}
                   onChange={(e) => setPoc((v) => ({ ...v, name: e.target.value }))} disabled={preview} />
            <input className="iex-input" placeholder="Phone" value={poc.phone}
                   onChange={(e) => setPoc((v) => ({ ...v, phone: e.target.value }))} disabled={preview} />
            <button className="iex-btn" disabled={busy || preview || !poc.name.trim()} onClick={savePoc}>Save</button>
          </div>
        )}

        {/* Notes thread */}
        <div className="iex-lbl" style={{ marginTop: 14 }}>Notes &amp; Messages</div>
        <div className="iex-compose">
          <textarea className="iex-note-input" rows={2} placeholder="Add a note — access details, questions, anything we should know…"
                    value={draft} onChange={(e) => setDraft(e.target.value)} disabled={preview} />
          <button className="iex-btn" disabled={busy || preview || !draft.trim()} onClick={sendNote}>Send</button>
        </div>
        {notes.length > 0 && (
          <div className="iex-notes">
            {notes.map((n) => (
              <div key={n.id} className="iex-note">
                <span className={`iex-note-who ${n.author_role === "customer" ? "cust" : "staff"}`}>{n.author_name || n.author_role || "—"}</span>
                <span className="iex-note-body">{n.body}</span>
                <span className="iex-note-when">{n.created_at ? String(n.created_at).slice(0, 16).replace("T", " ") : ""}</span>
              </div>
            ))}
          </div>
        )}
        {preview && <div className="iex-fine">Read-only in preview.</div>}
      </div>
    </div>
  );
}

const IEX_CSS = `
.iex-err{background:#FBE6E4;border:1px solid #e0b0a8;color:#a8442f;font-size:.78rem;font-weight:600;padding:8px 11px;border-radius:8px;margin-bottom:10px}
.iex-lbl{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#6f7686);margin-bottom:7px}
.iex-poc-form{display:flex;gap:8px;flex-wrap:wrap}
.iex-poc-form .iex-input:first-child{flex:2;min-width:180px}
.iex-poc-form .iex-input{flex:1;min-width:130px}
.iex-input{height:38px;border:1px solid var(--line,#d9d4ca);border-radius:8px;background:#fff;color:var(--ink,#0B0F1A);padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.iex-input:focus{border-color:#6FBF73}
.iex-poc-saved{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#f2f9f3;border:1px solid #cde6d2;border-radius:9px;padding:9px 13px}
.iex-poc-name{font-size:.84rem;font-weight:800;color:var(--ink,#0B0F1A)}
.iex-poc-phone{font-size:.8rem;color:var(--muted,#6f7686)}
.iex-link{background:none;border:none;color:#2f7d5a;font-size:.74rem;font-weight:700;cursor:pointer;text-decoration:underline;font-family:inherit;margin-left:auto}
.iex-compose{display:flex;gap:8px;align-items:flex-end}
.iex-note-input{flex:1;border:1px solid var(--line,#d9d4ca);border-radius:9px;background:#fff;color:var(--ink,#0B0F1A);padding:9px 11px;font-size:.82rem;font-family:inherit;outline:none;resize:vertical}
.iex-note-input:focus{border-color:#6FBF73}
.iex-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:#2f7d5a;color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit}
.iex-btn:hover{filter:brightness(1.08)}
.iex-btn:disabled{opacity:.5;cursor:default}
.iex-notes{margin-top:10px;display:flex;flex-direction:column;gap:7px}
.iex-note{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;font-size:.8rem;padding:7px 0;border-bottom:1px solid #f0ece6}
.iex-note-who{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:100px;white-space:nowrap}
.iex-note-who.cust{background:#F3E9D3;color:#8a6d2f}
.iex-note-who.staff{background:#e6eaf3;color:#3a4a72}
.iex-note-body{color:var(--ink,#0B0F1A);white-space:pre-wrap;min-width:0}
.iex-note-when{font-size:.7rem;color:#8a93a8;white-space:nowrap}
.iex-fine{margin-top:8px;font-size:.72rem;color:var(--muted,#6f7686)}
`;
