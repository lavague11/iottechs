"use client";
import { useState, useEffect } from "react";
import {
  PROPOSAL_SERVICES, PRICE_FIELDS, PROPOSAL_CATALOG, serviceLabel,
  loadPriceBook, savePriceBookCache,
} from "../../../lib/proposal";
import { getPriceBookAction, savePriceBookAction } from "./proposal-actions";
import PresetEditor from "./proposal-preset-editor";
import ConditionEditor from "./proposal-condition-editor";

const nice = (name) => name.replace(/^NVR \(|\)$/g, "").replace(/ Storage Drive$/, "");
const LABOR_NAMES = new Set(PRICE_FIELDS[0].names);
const NVR_NAMES = new Set(PRICE_FIELDS[1].names);
const HDD_NAMES = new Set(PRICE_FIELDS[2].names);

// Sections to render: `scopeKey` narrows to one service (a service's own gear icon);
// null shows every service (the header gear). Camera splits into 3 sub-groups because
// NVR models + storage drives are structurally locked (their names are pattern-matched
// by the NVR/HDD pickers) — everything else is a plain, fully-editable catalog list.
function sectionsFor(scope) {
  // scope: a single service key, an array of keys (project-active services), or null (every service).
  const keys = Array.isArray(scope) ? scope : scope ? [scope] : PROPOSAL_SERVICES.map((s) => s.key);
  const out = [];
  keys.forEach((key) => {
    if (key === "camera") {
      out.push({ id: "camera-labor", svc: "camera", label: "Camera & Labor", allowAdd: true,
        match: (n) => !NVR_NAMES.has(n) && !HDD_NAMES.has(n) });
      out.push({ id: "camera-nvr", svc: "camera", label: "Recorder (NVR)", allowAdd: false, match: (n) => NVR_NAMES.has(n) });
      out.push({ id: "camera-hdd", svc: "camera", label: "Storage", allowAdd: false, match: (n) => HDD_NAMES.has(n) });
    } else {
      out.push({ id: key, svc: key, label: serviceLabel(key), allowAdd: true, match: () => true });
    }
  });
  return out;
}

function rowsFor(section, book) {
  const hidden = new Set(book.hidden?.[section.svc] || []);
  const base = (PROPOSAL_CATALOG[section.svc] || [])
    .filter((c) => section.match(c.name))
    .filter((c) => LABOR_NAMES.has(c.name) || NVR_NAMES.has(c.name) || HDD_NAMES.has(c.name) || !hidden.has(c.name))
    .map((c) => ({
      baseName: c.name,
      locked: NVR_NAMES.has(c.name) || HDD_NAMES.has(c.name),
      name: (NVR_NAMES.has(c.name) || HDD_NAMES.has(c.name)) ? c.name : (book.names?.[c.name] || c.name),
      price: book.prices?.[c.name] != null ? String(book.prices[c.name]) : String(c.price),
    }));
  const custom = (book.custom?.[section.svc] || []).map((c, i) => ({ baseName: c.name, custom: true, customIdx: i, locked: false, name: c.name, price: String(c.price ?? 0) }));
  return [...base, ...custom];
}

export default function PricingDefaults({ onClose, onSaved, scopeKey, scopeKeys, embedded = false }) {
  const sections = sectionsFor(scopeKeys || scopeKey);
  const [book, setBook] = useState(() => loadPriceBook());
  const [open, setOpen] = useState(() => ({ [sections[0]?.id]: true }));
  const [newItem, setNewItem] = useState({}); // sectionId -> { name, price }
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  // Load the authoritative company book (falls back to the local cache if not authed).
  useEffect(() => {
    let live = true;
    getPriceBookAction().then((r) => { if (live && r?.ok) { savePriceBookCache(r.book); setBook(r.book); } }).catch(() => {});
    return () => { live = false; };
  }, []);

  function toggle(id) { setOpen((o) => ({ ...o, [id]: !o[id] })); }

  function setPrice(section, row, v) {
    setBook((b) => {
      if (row.custom) {
        const list = (b.custom[section.svc] || []).map((c, i) => (i === row.customIdx ? { ...c, price: v } : c));
        return { ...b, custom: { ...b.custom, [section.svc]: list } };
      }
      return { ...b, prices: { ...b.prices, [row.baseName]: v } };
    });
  }
  function setName(section, row, v) {
    setBook((b) => {
      if (row.custom) {
        const list = (b.custom[section.svc] || []).map((c, i) => (i === row.customIdx ? { ...c, name: v } : c));
        return { ...b, custom: { ...b.custom, [section.svc]: list } };
      }
      return { ...b, names: { ...b.names, [row.baseName]: v } };
    });
  }
  function removeRow(section, row) {
    setBook((b) => {
      if (row.custom) {
        const list = (b.custom[section.svc] || []).filter((_, i) => i !== row.customIdx);
        return { ...b, custom: { ...b.custom, [section.svc]: list } };
      }
      const list = [...new Set([...(b.hidden[section.svc] || []), row.baseName])];
      return { ...b, hidden: { ...b.hidden, [section.svc]: list } };
    });
  }
  function addCustom(section) {
    const draft = newItem[section.id];
    if (!draft?.name?.trim()) return;
    setBook((b) => ({
      ...b,
      custom: { ...b.custom, [section.svc]: [...(b.custom[section.svc] || []), { name: draft.name.trim(), price: draft.price || "0" }] },
    }));
    setNewItem((m) => ({ ...m, [section.id]: { name: "", price: "" } }));
    setOpen((o) => ({ ...o, [section.id]: true }));
  }

  async function save() {
    const clean = {
      prices: {}, names: {}, hidden: book.hidden || {}, custom: {},
      presets: Array.isArray(book.presets) ? book.presets : [], // preserve preset bundles across a price save
      conditions: Array.isArray(book.conditions) ? book.conditions : [], // preserve condition overrides too
    };
    Object.entries(book.prices || {}).forEach(([k, v]) => { if (v !== "" && +v >= 0) clean.prices[k] = +v; });
    Object.entries(book.names || {}).forEach(([k, v]) => { if (v && v.trim()) clean.names[k] = v.trim(); });
    Object.entries(book.custom || {}).forEach(([svc, list]) => {
      const items = (list || []).filter((c) => c.name?.trim()).map((c) => ({ name: c.name.trim(), price: +c.price || 0 }));
      if (items.length) clean.custom[svc] = items;
    });
    setBusy(true); setErr(null);
    const r = await savePriceBookAction(clean);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    savePriceBookCache(r.book);
    setBook(r.book);
    onSaved?.();
  }
  function resetAll() {
    setBook({ prices: {}, names: {}, hidden: {}, custom: {} });
  }

  const title = scopeKey ? `${serviceLabel(scopeKey)} pricing` : "Default pricing";

  return (
    <div className={`prc-backdrop${embedded ? " prc-embed" : ""}`} onClick={embedded ? undefined : onClose}>
      <div className="prc-modal" onClick={(e) => e.stopPropagation()}>
        {!embedded && (
          <div className="prc-head">
            <span className="prc-title">{title}</span>
            <button className="prc-x" onClick={onClose}>✕</button>
          </div>
        )}
        <div className="prc-sub">{scopeKey ? `${serviceLabel(scopeKey)} — new items in this proposal.` : "Company-wide defaults for newly added items."} Changes don’t rewrite items already placed.</div>
        {err && <div className="prc-err">{err}</div>}

        <div className="prc-body">
          {sections.map((section) => {
            const rows = rowsFor(section, book);
            const isOpen = !!open[section.id];
            const draft = newItem[section.id] || { name: "", price: "" };
            return (
              <div key={section.id} className="prc-group">
                <button type="button" className="prc-group-h" aria-expanded={isOpen} onClick={() => toggle(section.id)}>
                  <span className="prc-chev">{isOpen ? "▾" : "▸"}</span>
                  {section.label}
                  <span className="prc-count">{rows.length}</span>
                </button>
                {isOpen && (
                  <>
                    {rows.map((row) => (
                      <div key={row.baseName + (row.customIdx ?? "")} className="prc-row">
                        <input
                          className="prc-name-in"
                          value={row.name}
                          disabled={row.locked}
                          title={row.locked ? "Locked — used by the NVR/storage pickers" : "Rename"}
                          onChange={(e) => setName(section, row, e.target.value)}
                        />
                        <span className="prc-input">
                          <span className="prc-dollar">$</span>
                          <input type="number" min="0" step="0.01" value={row.price} onChange={(e) => setPrice(section, row, e.target.value)} />
                        </span>
                        {!row.locked && (
                          <button className="prc-rm" title="Remove from catalog" onClick={() => removeRow(section, row)}>✕</button>
                        )}
                      </div>
                    ))}
                    {section.allowAdd && (
                      <div className="prc-addrow">
                        <input className="prc-name-in" placeholder="New item name" value={draft.name}
                               onChange={(e) => setNewItem((m) => ({ ...m, [section.id]: { ...draft, name: e.target.value } }))} />
                        <span className="prc-input">
                          <span className="prc-dollar">$</span>
                          <input type="number" min="0" step="0.01" placeholder="0" value={draft.price}
                                 onChange={(e) => setNewItem((m) => ({ ...m, [section.id]: { ...draft, price: e.target.value } }))} />
                        </span>
                        <button className="prc-add" onClick={() => addCustom(section)}>+ Add</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="prc-acts">
          <button className="prc-reset" onClick={resetAll}>Reset to defaults</button>
          <button className="prc-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <style>{PRC_CSS}</style>
    </div>
  );
}

const PRC_CSS = `
.pvx .prc-backdrop{position:fixed;inset:0;z-index:10600;background:rgba(11,15,26,.5);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
.pvx .prc-modal{background:var(--dv-raise,#FBFBFA);border-radius:14px;width:min(520px,94vw);box-shadow:0 1px 2px rgba(16,20,24,.04);display:flex;flex-direction:column;overflow:hidden}
/* Embedded in the Configuration Center: no backdrop/modal chrome, the shell provides it. */
.pvx .prc-backdrop.prc-embed{position:static;inset:auto;z-index:auto;background:none;padding:0;overflow:visible;display:block}
.pvx .prc-backdrop.prc-embed .prc-modal{width:100%;box-shadow:none;border-radius:0;background:none}
.pvx .prc-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 4px}
.pvx .prc-title{font-size:1.05rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prc-x{background:none;border:none;font-size:1rem;color:var(--dv-meta,#787D84);cursor:pointer}
.pvx .prc-x:hover{color:var(--dv-red,#C4553D)}
.pvx .prc-sub{font-size:.78rem;color:var(--dv-meta,#787D84);padding:0 22px 14px;line-height:1.45}
.pvx .prc-err{margin:0 22px 12px;padding:8px 11px;border-radius:8px;background:rgba(196,85,61,.08);color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:500}
.pvx .prc-body{padding:0 22px 16px;display:flex;flex-direction:column;gap:12px}
.pvx .prc-group{border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(16,20,24,.04)}
.pvx .prc-group-h{display:flex;align-items:center;gap:8px;width:100%;background:var(--dv-paper,#F4F4F2);border:none;border-bottom:1px solid transparent;padding:11px 14px;font-size:.72rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-gold-text,#8A6A1F);cursor:pointer;font-family:inherit;text-align:left}
.pvx .prc-group-h:hover{background:var(--dv-line-soft,#EDEDE9)}
.pvx .prc-group-h[aria-expanded="true"]{border-bottom-color:var(--dv-line,#E4E4DF)}
.pvx .prc-chev{color:var(--dv-gold-text,#8A6A1F);font-size:.68rem}
.pvx .prc-count{margin-left:auto;font-size:.66rem;font-weight:500;color:var(--dv-meta,#787D84);text-transform:none;letter-spacing:0}
.pvx .prc-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.pvx .prc-row:first-of-type{border-top:none}
.pvx .prc-name-in{flex:1;height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:var(--dv-raise,#FBFBFA);padding:0 10px;font-size:.82rem;font-weight:500;color:var(--dv-ink,#101418);font-family:inherit;outline:none;min-width:0}
.pvx .prc-name-in:disabled{background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);border-color:transparent}
.pvx .prc-name-in:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prc-input{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 8px;background:var(--dv-paper,#F4F4F2);flex-shrink:0}
.pvx .prc-input:focus-within{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prc-dollar{font-size:.8rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pvx .prc-input input{width:64px;height:32px;border:none;background:transparent;text-align:right;font-size:.86rem;font-weight:500;color:var(--dv-ink,#101418);font-family:inherit;outline:none}
.pvx .prc-input input::-webkit-outer-spin-button,.pvx .prc-input input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.pvx .prc-input input{-moz-appearance:textfield;appearance:textfield}
.pvx .prc-rm{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.85rem;cursor:pointer;flex-shrink:0;padding:4px 6px}
.pvx .prc-rm:hover{color:var(--dv-red,#C4553D)}
.pvx .prc-addrow{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:var(--dv-paper,#F4F4F2)}
.pvx .prc-add{height:30px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:transparent;color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:500;cursor:pointer;font-family:inherit;flex-shrink:0}
.pvx .prc-add:hover{background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418)}
.pvx .prc-acts{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prc-reset{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:500;cursor:pointer;font-family:inherit}
.pvx .prc-reset:hover{color:var(--dv-ink,#101418)}
.pvx .prc-save{height:38px;padding:0 22px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prc-save:hover{filter:brightness(1.12)}
.pvx .prc-save:disabled{opacity:.6;cursor:default}
`;

// The one proposal Configuration Center. ONE modal over the EXISTING editors (never a second pricing
// engine): Pricing (per-service catalog, selected by the Service dropdown), Presets (per-service bundles),
// Conditions (company-wide line-item condition display). The old "Default Pricing" tab (same editor, every
// service at once) was removed — it duplicated Service Pricing. Tab + service are remembered while open.
// `services` = the configurable services to offer in the Pricing/Presets selectors.
export function ProposalConfig({ onClose, onSaved, startTab = "service", startService = "camera", services = PROPOSAL_SERVICES }) {
  // Only the services actually in this proposal are configurable here (passed by the builder). The
  // company catalog/pricing/presets for other services are untouched — just not surfaced in this project.
  const svcKeys = services.map((s) => s.key);
  const [tab, setTab] = useState(startTab === "default" ? "service" : startTab);
  const [svc, setSvc] = useState(svcKeys.includes(startService) ? startService : (svcKeys[0] || "camera"));
  const needsSel = tab === "service" || tab === "presets";
  const noServices = services.length === 0;
  return (
    <div className="cfg-backdrop" onClick={onClose}>
      <div className="cfg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cfg-head">
          <span className="cfg-title">Proposal Configuration</span>
          <button className="cfg-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {noServices ? (
          <div className="cfg-body"><div className="cfg-empty">No services in this proposal yet.<br />Add a service to configure its pricing and presets.</div></div>
        ) : (<>
        <div className="cfg-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "service"} className={tab === "service" ? "on" : ""} onClick={() => setTab("service")}>Pricing</button>
          <button type="button" role="tab" aria-selected={tab === "presets"} className={tab === "presets" ? "on" : ""} onClick={() => setTab("presets")}>Presets</button>
          <button type="button" role="tab" aria-selected={tab === "conditions"} className={tab === "conditions" ? "on" : ""} onClick={() => setTab("conditions")}>Conditions</button>
        </div>
        {needsSel && (
          <div className="cfg-svcsel">
            <label htmlFor="cfg-svc">Service</label>
            <select id="cfg-svc" value={svc} onChange={(e) => setSvc(e.target.value)}>
              {services.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div className="cfg-body">
          {tab === "service" && <PricingDefaults embedded key={`svc-${svc}`} scopeKey={svc} onSaved={onSaved} />}
          {tab === "presets" && <PresetEditor embedded key={`pst-${svc}`} serviceKey={svc} onSaved={onSaved} />}
          {tab === "conditions" && <ConditionEditor embedded onSaved={onSaved} />}
        </div>
        </>)}
        <style>{CFG_CSS}</style>
      </div>
    </div>
  );
}

const CFG_CSS = `
.pvx .cfg-backdrop{position:fixed;inset:0;z-index:10600;background:rgba(11,15,26,.5);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
.pvx .cfg-modal{background:var(--dv-raise,#FBFBFA);border-radius:14px;width:min(640px,96vw);max-height:84dvh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px -18px rgba(16,17,18,.5)}
.pvx .cfg-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 10px;flex:0 0 auto}
.pvx .cfg-title{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418)}
.pvx .cfg-x{background:none;border:none;font-size:1rem;color:var(--dv-meta,#787D84);cursor:pointer;line-height:1}
.pvx .cfg-x:hover{color:var(--dv-red,#C4553D)}
.pvx .cfg-tabs{display:flex;gap:2px;padding:0 16px;border-bottom:1px solid var(--dv-line,#E4E4DF);flex:0 0 auto;overflow-x:auto}
.pvx .cfg-tabs button{appearance:none;border:0;background:none;font-family:inherit;font-size:.82rem;font-weight:600;color:var(--dv-meta,#787D84);padding:10px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.pvx .cfg-tabs button:hover{color:var(--dv-ink,#101418)}
.pvx .cfg-tabs button.on{color:var(--dv-ink,#101418);border-bottom-color:var(--dv-gold,#C9A96E)}
.pvx .cfg-svcsel{display:flex;align-items:center;gap:10px;padding:13px 22px 2px;flex:0 0 auto}
.pvx .cfg-svcsel label{font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .cfg-svcsel select{height:34px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;font-family:inherit;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418);padding:0 10px;outline:none;cursor:pointer}
.pvx .cfg-svcsel select:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .cfg-empty{padding:34px 22px;text-align:center;font-size:.86rem;line-height:1.6;color:var(--dv-meta,#787D84)}
.pvx .cfg-body{flex:1 1 auto;min-height:0;overflow-y:auto}
@media(max-width:560px){
  .pvx .cfg-backdrop{padding:0}
  .pvx .cfg-modal{width:100vw;max-height:100dvh;height:100dvh;border-radius:0}
}
`;
