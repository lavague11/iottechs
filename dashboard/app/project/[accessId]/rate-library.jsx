"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getRatesAction, saveRatesAction } from "./proposal-actions";

// Work-order rate library. Company DEFAULT rates plus optional per-technician overrides. A blank
// field on a technician scope inherits the default. Rates are the per-step install labor payouts.
const GROUPS = [
  { title: "Camera (per step)", color: "var(--gold)", bundle: "camera", keys: [["cam_drop", "Cable Drop"], ["cam_mgmt", "Cable Mgmt"], ["cam_term", "Termination"], ["cam_mount", "Mounting"], ["cam_program", "Programming"], ["cam_waterproof", "Waterproofing"]] },
  { title: "Toast POS / Network (per step)", color: "#7c3aed", bundle: "device", keys: [["pos_drop", "Cable Drop"], ["pos_mgmt", "Cable Mgmt"], ["pos_term", "Termination"], ["pos_install", "Install"]] },
  { title: "Equipment (per unit)", color: "#4b6a9b", keys: [["nvr_setup", "NVR Setup"], ["hdd_install", "HDD / Storage Drive"], ["monitor_mount", "Monitor + Mount"]] },
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

  // Lock the page behind the sheet so the Install page can't scroll under it (and Esc closes it).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open) return null;
  const isDefault = scope === "default";
  const techNames = Object.keys(book.techs);
  // On a tech scope, the placeholder shows the value they'd inherit (default-scope, then company).
  const inherit = (k) => (book.default[k] ?? defaults[k]);
  const val = (k) => (draft[k] ?? "");
  const effective = (k) => (draft[k] != null && draft[k] !== "" ? +draft[k] : +inherit(k) || 0);
  const groupTotal = (g) => g.keys.reduce((a, [k]) => a + effective(k), 0);

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

  // Portal to <body> so the fixed overlay covers the true viewport — the deck slides use CSS transforms,
  // which would otherwise trap position:fixed inside the deck's content area (below the project header).
  return createPortal(
    <div className="rl-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <style>{RL_CSS}</style>
      <div className="rl-card" role="dialog" aria-modal="true">
        <div className="rl-head">
          <div><b>Rates</b><span>Technician payout rates — defaults + per-tech overrides</span></div>
          <button type="button" className="rl-x" onClick={onClose} aria-label="Close rates">✕</button>
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
                {g.bundle && <span className="rl-group-tot">= {money(groupTotal(g))} / {g.bundle}</span>}
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
    </div>,
    document.body
  );
}

const RL_CSS = `
.rl-overlay{position:fixed;inset:0;z-index:12000;background:rgba(11,15,26,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;animation:rlFade .16s ease}
@keyframes rlFade{from{opacity:0}to{opacity:1}}
.rl-card{position:relative;width:min(560px,96vw);max-height:92vh;overflow:auto;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;box-shadow:0 1px 2px rgba(16,20,24,.04);font-family:var(--font);display:flex;flex-direction:column}
/* Sticky header — the ✕ must stay visible no matter how far the rates scroll (was scrolling away). */
.rl-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--dv-ink,#101418);color:#fff;padding:14px 16px;border-radius:14px 14px 0 0}
.rl-head b{font-size:1.02rem;font-weight:600;display:block}
.rl-head span{font-size:.74rem;color:var(--dv-faint,#A1A6AC)}
.rl-x{flex:0 0 auto;width:38px;height:38px;display:grid;place-items:center;background:rgba(255,255,255,.08);border:none;border-radius:9px;color:#fff;font-size:1.05rem;cursor:pointer;line-height:1}
.rl-x:hover{background:rgba(255,255,255,.18)}
.rl-scopes{display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:14px 18px 0}
.rl-scope{height:32px;padding:0 13px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:500;cursor:pointer;font-family:inherit}
.rl-scope:hover{border-color:var(--dv-gold,#C9A96E)}
.rl-scope.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:var(--dv-gold,#C9A96E)}
.rl-addtech{display:inline-flex;align-items:center;gap:0}
.rl-addtech input{height:32px;border:1px solid var(--dv-line,#E4E4DF);border-right:none;border-radius:8px 0 0 8px;padding:0 10px;font-size:.76rem;font-family:inherit;outline:none;width:130px}
.rl-addtech button{height:32px;border:1px solid var(--dv-ink,#101418);background:var(--dv-ink,#101418);color:#fff;border-radius:0 8px 8px 0;font-weight:600;cursor:pointer;padding:0 10px}
.rl-addtech button:disabled{opacity:.5;cursor:default}
.rl-scope-label{padding:11px 18px 0;font-size:.8rem;color:var(--dv-meta,#787D84)}
.rl-scope-label b{color:var(--dv-ink,#101418)}
.rl-groups{padding:14px 18px;display:flex;flex-direction:column;gap:12px}
.rl-group{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid var(--rl-c);border-radius:11px;padding:11px 13px}
.rl-group-hd{font-size:.74rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:9px;display:flex;justify-content:space-between;align-items:baseline;gap:8px 12px;flex-wrap:wrap}
.rl-group-tot{color:var(--dv-green,#2E7D5B);font-weight:600;white-space:nowrap}
.rl-field{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;font-size:.85rem;color:var(--dv-ink,#101418)}
.rl-in-wrap{display:flex;align-items:center;gap:2px;color:var(--dv-meta,#787D84);font-weight:500}
.rl-in-wrap input{width:78px;height:34px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 9px;font-size:.86rem;font-weight:500;text-align:right;font-family:inherit;outline:none;color:var(--dv-ink,#101418)}
.rl-in-wrap input:focus{border-color:var(--rl-c)}
/* Sticky footer — Save / Close stay reachable without scrolling to the bottom of a long rate list. */
.rl-actions{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;margin-top:auto;background:var(--dv-raise,#FBFBFA);border-top:1px solid var(--dv-line,#E4E4DF)}
.rl-save{height:40px;padding:0 22px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.rl-save:hover{filter:brightness(1.12)}
.rl-save:disabled{opacity:.7;cursor:default}
.rl-clear{height:40px;padding:0 14px;border:1px solid rgba(196,85,61,.35);border-radius:9px;background:transparent;color:var(--dv-red,#C4553D);font-size:.8rem;font-weight:500;cursor:pointer;font-family:inherit}
.rl-cancel{height:40px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:transparent;color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:500;cursor:pointer;font-family:inherit;margin-left:auto}
/* Mobile: a near-full-height bottom sheet, not a squeezed centred dialog. Header + footer stay
   pinned (obvious ✕, always-reachable Save/Close); only the rate list scrolls. */
@media (max-width:600px){
  .rl-overlay{padding:0;align-items:flex-end}
  .rl-card{width:100vw;max-width:100vw;height:96dvh;max-height:96dvh;border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none}
  .rl-scopes{padding:12px 14px 0}
  .rl-scope-label{padding:10px 14px 0}
  .rl-groups{padding:12px 14px}
  .rl-addtech input{width:auto;flex:1 1 auto;min-width:0}
  .rl-addtech{flex:1 1 100%}
}
`;
