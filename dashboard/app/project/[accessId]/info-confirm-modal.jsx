"use client";

import { useState, useRef } from "react";
import { confirmInfoAction } from "./actions";
import { loadPlaces } from "../../../lib/places";

// First-login welcome for the customer: a modal that shows the contact details we have on file so
// they can confirm — or fix anything wrong — before anything else. Confirming stamps
// info_confirmed_at on the project (server-side), so it only ever appears once.
export default function InfoConfirmModal({ accessId, project, onDone }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");
  const [f, setF] = useState({
    contact_name:  project.contact_name  || "",
    company_name:  project.company_name  || "",
    contact_phone: project.contact_phone || "",
    contact_email: project.contact_email || "",
    address:       project.address       || "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // Google Places, bound on first FOCUS of each input (edit mode) — the node is stable and in the
  // DOM by then, dodging React Strict-Mode remount races. Picking a business fills its NAME and
  // auto-fills the ADDRESS; the address field autocompletes street addresses. Fails silently to a
  // plain text input when no Maps key is configured.
  const setFRef = useRef(setF);
  setFRef.current = setF;
  const bind = (node, types, onPlace) => {
    if (!node || node.__acBound) return; node.__acBound = true;
    loadPlaces().catch(() => {});   // kick off the Maps script load (its promise resolves before the
                                    // places lib finishes async-initializing, so poll for readiness)
    let tries = 0;
    const t = setInterval(() => {
      const AC = window.google?.maps?.places?.Autocomplete;
      if (AC) {
        clearInterval(t);
        try {
          const ac = new AC(node, { types, fields: ["formatted_address", "name"] });
          ac.addListener("place_changed", () => { const p = ac.getPlace(); if (p) onPlace({ name: p.name || "", address: p.formatted_address || "" }); });
          node.setAttribute("autocomplete", "off");
        } catch (_) { node.__acBound = false; }
      } else if (++tries > 45) { clearInterval(t); node.__acBound = false; }   // ~9s give-up → plain input
    }, 200);
  };
  const bindBiz  = (node) => bind(node, ["establishment"], ({ name, address }) => setFRef.current((p) => ({ ...p, company_name: name || p.company_name, address: address || p.address })));
  const bindAddr = (node) => bind(node, ["address"], ({ address }) => setFRef.current((p) => ({ ...p, address: address || p.address })));

  const ROWS = [
    { k: "contact_name",  label: "Name" },
    { k: "company_name",  label: "Business" },
    { k: "contact_phone", label: "Phone",   type: "tel" },
    { k: "contact_email", label: "Email",   type: "email" },
    { k: "address",       label: "Address", full: true },
  ];

  const first = (project.contact_name || project.customer || "").trim().split(/\s+/)[0];

  // Confirm (with any edits when in edit mode) → persist + stamp the flag → close for good.
  async function confirm() {
    setBusy(true); setErr("");
    const r = await confirmInfoAction(accessId, editing ? f : {});
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onDone?.();
  }

  return (
    <div className="icm-backdrop">
      <style>{CSS}</style>
      <div className="icm">
        <div className="icm-head">
          <div className="icm-badge">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div>
            <div className="icm-title">Welcome{first ? `, ${first}` : ""}!</div>
            <div className="icm-sub">Let’s make sure your details are right — this is how we’ll reach you about your project.</div>
          </div>
        </div>

        <div className="icm-body">
          {editing ? (
            <div className="icm-grid">
              {ROWS.map((r) => (
                <label key={r.k} className={`icm-field${r.full ? " full" : ""}`}>
                  <span>{r.label}</span>
                  <input
                    onFocus={r.k === "company_name" ? (e) => bindBiz(e.target) : r.k === "address" ? (e) => bindAddr(e.target) : undefined}
                    type={r.type || "text"} value={f[r.k]} onChange={set(r.k)}
                    placeholder={r.k === "company_name" ? "Business name — address auto-fills"
                              : r.k === "address" ? "Start typing an address…" : r.label}
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="icm-grid read">
              {ROWS.map((r) => (
                <div key={r.k} className={`icm-cell${r.full ? " full" : ""}`}>
                  <span className="icm-k">{r.label}</span>
                  <span className="icm-v">{f[r.k] || "—"}</span>
                </div>
              ))}
            </div>
          )}
          {err && <div className="icm-err">{err}</div>}
        </div>

        <div className="icm-actions">
          {editing ? (
            <>
              <button type="button" className="icm-primary" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "Save & Confirm"}</button>
              <button type="button" className="icm-ghost" disabled={busy} onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" className="icm-primary" disabled={busy} onClick={confirm}>{busy ? "…" : "Looks right — Confirm"}</button>
              <button type="button" className="icm-ghost" disabled={busy} onClick={() => setEditing(true)}>Something’s wrong — Edit</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.icm-backdrop{position:fixed;inset:0;z-index:11000;background:rgba(11,15,26,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;
  font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif;animation:icm-fade .18s ease}
@keyframes icm-fade{from{opacity:0}to{opacity:1}}
.icm{width:min(520px,96vw);background:#FAF8F4;border:1px solid #d9d4ca;border-top:4px solid #C9A96E;border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4);animation:icm-pop .2s ease}
@keyframes icm-pop{from{transform:translateY(10px) scale(.98);opacity:.6}to{transform:none;opacity:1}}
.icm-head{display:flex;gap:14px;align-items:flex-start;padding:22px 22px 4px}
.icm-badge{width:46px;height:46px;flex-shrink:0;border-radius:12px;background:#f7f0df;color:#a3812f;display:grid;place-items:center}
.icm-title{font-size:1.25rem;font-weight:800;color:#0B0F1A;letter-spacing:-.01em}
.icm-sub{font-size:.86rem;color:#6f7686;line-height:1.45;margin-top:3px}
.icm-body{padding:16px 22px 4px}
.icm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px}
.icm-cell,.icm-field{display:flex;flex-direction:column;gap:3px;min-width:0}
.icm-cell.full,.icm-field.full{grid-column:1/-1}
.icm-k,.icm-field span{font-size:.64rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a8578}
.icm-v{font-size:.94rem;font-weight:700;color:#0B0F1A;overflow:hidden;text-overflow:ellipsis}
.icm-field input{border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#0B0F1A;padding:10px 12px;font-size:.92rem;font-family:inherit;outline:none}
.icm-field input:focus{border-color:#C9A96E}
.icm-err{margin-top:12px;font-size:.82rem;color:#c0392b;font-weight:600}
.icm-actions{display:flex;gap:10px;flex-wrap:wrap;padding:18px 22px 22px}
.icm-primary{height:44px;padding:0 22px;border:none;border-radius:10px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.9rem;font-weight:800;cursor:pointer;font-family:inherit}
.icm-primary:hover:not(:disabled){filter:brightness(1.05)}
.icm-primary:disabled{opacity:.55;cursor:default}
.icm-ghost{height:44px;padding:0 18px;border:1px solid #d9d4ca;border-radius:10px;background:#fff;color:#5b6275;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit}
.icm-ghost:hover:not(:disabled){border-color:#C9A96E;color:#0B0F1A}
/* Google Places dropdown renders on <body>; lift it above the modal (z 11000). */
.pac-container{z-index:12000!important}
`;
