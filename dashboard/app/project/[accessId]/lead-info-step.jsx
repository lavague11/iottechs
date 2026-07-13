"use client";

import { useState } from "react";
import { updateProjectInfoAction } from "./actions";

// The customer's first step in the Survey phase: confirm the contact details we have on file, or
// edit anything that's wrong. Edits persist to the project's contact fields (name/business/phone/
// email/address). Confirming is a soft acknowledgment that lets the flow move on.
export default function LeadInfoStep({ accessId, project, preview, onConfirmed }) {
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr]             = useState("");
  const [f, setF] = useState({
    contact_name:  project.contact_name  || "",
    company_name:  project.company_name  || "",
    contact_phone: project.contact_phone || "",
    contact_email: project.contact_email || "",
    address:       project.address       || "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const ROWS = [
    { k: "contact_name",  label: "Name" },
    { k: "company_name",  label: "Business" },
    { k: "contact_phone", label: "Phone",   type: "tel" },
    { k: "contact_email", label: "Email",   type: "email" },
    { k: "address",       label: "Address", full: true },
  ];

  async function save() {
    if (preview) return;
    setSaving(true); setErr("");
    const r = await updateProjectInfoAction(accessId, f);
    setSaving(false);
    if (r?.error) { setErr(r.error); return; }
    setEditing(false); setConfirmed(true); onConfirmed?.();
  }
  function confirm() {
    if (preview) return;
    setConfirmed(true); onConfirmed?.();
  }

  return (
    <div className="lis">
      <style>{LIS_CSS}</style>
      {editing ? (
        <>
          <div className="lis-grid">
            {ROWS.map((r) => (
              <label key={r.k} className={`lis-field${r.full ? " full" : ""}`}>
                <span>{r.label}</span>
                <input type={r.type || "text"} value={f[r.k]} onChange={set(r.k)} placeholder={r.label} />
              </label>
            ))}
          </div>
          {err && <div className="lis-err">{err}</div>}
          <div className="lis-actions">
            <button type="button" className="lis-save" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" className="lis-edit" onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="lis-grid read">
            {ROWS.map((r) => (
              <div key={r.k} className={`lis-cell${r.full ? " full" : ""}`}>
                <span className="lis-k">{r.label}</span>
                {r.k === "contact_phone" && f[r.k] ? <a className="lis-v link" href={`tel:${f[r.k]}`}>{f[r.k]}</a>
                  : r.k === "contact_email" && f[r.k] ? <a className="lis-v link" href={`mailto:${f[r.k]}`}>{f[r.k]}</a>
                  : <span className="lis-v">{f[r.k] || "—"}</span>}
              </div>
            ))}
          </div>
          <div className="lis-actions">
            {confirmed ? (
              <span className="lis-confirmed"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Confirmed — thanks!</span>
            ) : (
              <button type="button" className="lis-save" disabled={preview} onClick={confirm}>Looks right — Confirm</button>
            )}
            <button type="button" className="lis-edit" onClick={() => setEditing(true)}>Edit</button>
          </div>
        </>
      )}
    </div>
  );
}

const LIS_CSS = `
.lis-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px}
.lis-cell,.lis-field{display:flex;flex-direction:column;gap:3px;min-width:0}
.lis-cell.full,.lis-field.full{grid-column:1/-1}
.lis-k{font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a8578}
.lis-v{font-size:.92rem;font-weight:700;color:#0B0F1A;overflow:hidden;text-overflow:ellipsis}
.lis-v.link{color:#8a6d2f;text-decoration:none}
.lis-v.link:hover{text-decoration:underline}
.lis-field span{font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a8578}
.lis-field input{border:1px solid #d9d4ca;border-radius:8px;background:#faf8f4;color:#0B0F1A;padding:9px 11px;font-size:.9rem;font-family:inherit;outline:none}
.lis-field input:focus{border-color:#C9A96E;background:#fff}
.lis-err{margin-top:10px;font-size:.82rem;color:#c0392b}
.lis-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}
.lis-save{height:40px;padding:0 18px;border:none;border-radius:9px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.88rem;font-weight:800;cursor:pointer;font-family:inherit}
.lis-save:hover:not(:disabled){filter:brightness(1.05)}
.lis-save:disabled{opacity:.55;cursor:default}
.lis-edit{height:40px;padding:0 16px;border:1px solid #d9d4ca;border-radius:9px;background:#fff;color:#5b6275;font-size:.86rem;font-weight:700;cursor:pointer;font-family:inherit}
.lis-edit:hover{border-color:#C9A96E;color:#0B0F1A}
.lis-confirmed{display:inline-flex;align-items:center;gap:6px;font-size:.86rem;font-weight:800;color:#1d7a3a}
`;
