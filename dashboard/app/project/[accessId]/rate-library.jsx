"use client";
import { useState, useEffect } from "react";
import { getRatesAction, saveRatesAction } from "./proposal-actions";

// Work-order rate library. Company DEFAULT rates plus optional per-technician overrides. A blank
// field on a technician scope inherits the default. Rates are the per-step install labor payouts.
const GROUPS = [
  { title: "Camera (per step)", color: "#C9A96E", keys: [["cam_drop", "Cable Drop"], ["cam_mgmt", "Cable Mgmt"], ["cam_term", "Termination"], ["cam_mount", "Mounting"]] },
  { title: "Toast POS / Network (per step)", color: "#7c3aed", keys: [["pos_drop", "Cable Drop"], ["pos_mgmt", "Cable Mgmt"], ["pos_term", "Termination"], ["pos_install", "Install"]] },
  { title: "NVR", color: "#4b6a9b", keys: [["nvr_setup", "Setup"]] },
];
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RateLibrary({ open, onClose, accessId, onSaved }) {
  const [book, setBook] = useState({ default: {}, techs: {} });
  const [defaults, setDefaults] = useState({});
  const [scope, setScope] = useState("default"); // "default" | "tech:<name>"
  const [draft, setDraft] = useState({});
  const [newTech, setNewTech] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    getRatesAction(accessId).then((r) => { if (r?.ok) { setBook(r.book); setDefaults(r.defaults || {}); } }).catch(() => {});
  }, [open, accessId]);

  // Load the selected scope's stored values into the editable draft.
  useEffect(() => {
    if (scope === "default") setDraft({ ...book.default });
    else setDraft({ ...(book.techs[scope.slice(5)] || {}) });
  }, [scope, book]);

  if (!open) return null;
  const isDefault = scope === "default";
  const techNames = Object.keys(book.techs);
  // On a tech scope, the placeholder shows the value they'd inherit (default-scope, then company).
  const inherit = (k) => (book.default[k] ?? defaults[k]);
  const val = (k) => (draft[k] ?? "");
  const effective = (k) => (draft[k] != null && draft[k] !== "" ? +draft[k] : +inherit(k) || 0);
  const camTotal = GROUPS[0].keys.reduce((a, [k]) => a + effective(k), 0);
  const posTotal = GROUPS[1].keys.reduce((a, [k]) => a + effective(k), 0);

  async function save() {
    setBusy(true);
    const r = await saveRatesAction(scope, draft);
    setBusy(false);
    if (r?.ok) { setBook(r.book); setSaved(true); setTimeout(() => setSaved(false), 1800); onSaved?.(r.book); }
  }
  function addTech() {
    const n = newTech.trim(); if (!n) return;
    setScope("tech:" + n); setNewTech("");
  }

  return (
    <div className="rl-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <style>{RL_CSS}</style>
      <div className="rl-card" role="dialog" aria-modal="true">
        <div className="rl-head">
          <div><b>Work Order Rate Library</b><span>Per-step technician payouts — company defaults + per-tech overrides</span></div>
          <button type="button" className="rl-x" onClick={onClose}>✕</button>
        </div>

        <div className="rl-scopes">
          <button type="button" className={`rl-scope${isDefault ? " on" : ""}`} onClick={() => setScope("default")}>Default (all techs)</button>
          {techNames.map((n) => (
            <button key={n} type="button" className={`rl-scope${scope === "tech:" + n ? " on" : ""}`} onClick={() => setScope("tech:" + n)}>{n}</button>
          ))}
          <span className="rl-addtech">
            <input placeholder="Add technician…" value={newTech} onChange={(e) => setNewTech(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTech()} />
            <button type="button" onClick={addTech} disabled={!newTech.trim()}>+ </button>
          </span>
        </div>

        <div className="rl-scope-label">
          {isDefault ? "Editing company default rates." : <>Editing overrides for <b>{scope.slice(5)}</b>. Leave a field blank to use the default.</>}
        </div>

        <div className="rl-groups">
          {GROUPS.map((g) => (
            <div key={g.title} className="rl-group" style={{ "--rl-c": g.color }}>
              <div className="rl-group-hd">{g.title}
                {g.keys.length > 1 && <span className="rl-group-tot">= {money(g === GROUPS[0] ? camTotal : posTotal)}</span>}
              </div>
              {g.keys.map(([k, label]) => (
                <label key={k} className="rl-field">
                  <span>{label}</span>
                  <span className="rl-in-wrap">$<input type="number" min="0" step="1" value={val(k)}
                    placeholder={isDefault ? String(defaults[k] ?? "") : String(inherit(k) ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} /></span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="rl-actions">
          <button type="button" className="rl-save" disabled={busy} onClick={save}>{busy ? "Saving…" : saved ? "✓ Saved" : "Save rates"}</button>
          {!isDefault && Object.keys(draft).length > 0 && (
            <button type="button" className="rl-clear" disabled={busy} onClick={() => setDraft({})}>Clear overrides</button>
          )}
          <button type="button" className="rl-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const RL_CSS = `
.rl-overlay{position:fixed;inset:0;z-index:12000;background:rgba(11,15,26,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;animation:rlFade .16s ease}
@keyframes rlFade{from{opacity:0}to{opacity:1}}
.rl-card{width:min(560px,96vw);max-height:92vh;overflow:auto;background:#FAF8F4;border:1px solid #e3ddd1;border-radius:14px;box-shadow:0 24px 70px rgba(11,15,26,.4);font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.rl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:#0B0F1A;color:#fff;padding:16px 18px;border-radius:14px 14px 0 0}
.rl-head b{font-size:1rem;font-weight:800;display:block}
.rl-head span{font-size:.74rem;color:#9aa1af}
.rl-x{background:none;border:none;color:#9aa1af;font-size:1.1rem;cursor:pointer;line-height:1}
.rl-x:hover{color:#fff}
.rl-scopes{display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:14px 18px 0}
.rl-scope{height:32px;padding:0 13px;border-radius:100px;border:1.5px solid #d9d4ca;background:#fff;color:#4a5270;font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.rl-scope:hover{border-color:#C9A96E}
.rl-scope.on{background:#0B0F1A;border-color:#0B0F1A;color:#C9A96E}
.rl-addtech{display:inline-flex;align-items:center;gap:0}
.rl-addtech input{height:32px;border:1px solid #d9d4ca;border-right:none;border-radius:8px 0 0 8px;padding:0 10px;font-size:.76rem;font-family:inherit;outline:none;width:130px}
.rl-addtech button{height:32px;border:1px solid #C9A96E;background:#C9A96E;color:#0B0F1A;border-radius:0 8px 8px 0;font-weight:800;cursor:pointer;padding:0 10px}
.rl-addtech button:disabled{opacity:.5;cursor:default}
.rl-scope-label{padding:11px 18px 0;font-size:.8rem;color:#6f7686}
.rl-scope-label b{color:#0B0F1A}
.rl-groups{padding:14px 18px;display:flex;flex-direction:column;gap:12px}
.rl-group{background:#fff;border:1px solid #e2ddd2;border-left:3px solid var(--rl-c);border-radius:11px;padding:11px 13px}
.rl-group-hd{font-size:.74rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#4a5270;margin-bottom:9px;display:flex;justify-content:space-between;align-items:baseline}
.rl-group-tot{color:#1d7a3a;font-weight:800}
.rl-field{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;font-size:.85rem;color:#0B0F1A}
.rl-in-wrap{display:flex;align-items:center;gap:2px;color:#6f7686;font-weight:700}
.rl-in-wrap input{width:78px;height:34px;border:1px solid #d9d4ca;border-radius:8px;padding:0 9px;font-size:.86rem;font-weight:700;text-align:right;font-family:inherit;outline:none;color:#0B0F1A}
.rl-in-wrap input:focus{border-color:var(--rl-c)}
.rl-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:0 18px 18px}
.rl-save{height:40px;padding:0 22px;border:none;border-radius:9px;background:#2f7d5a;color:#fff;font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit}
.rl-save:hover{filter:brightness(1.08)}
.rl-save:disabled{opacity:.7;cursor:default}
.rl-clear{height:40px;padding:0 14px;border:1px solid #e0b0a8;border-radius:9px;background:#fff;color:#a8442f;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.rl-cancel{height:40px;padding:0 14px;border:1px solid #d9d4ca;border-radius:9px;background:#fff;color:#4a5270;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit;margin-left:auto}
`;
