"use client";
import { useState, useEffect } from "react";
import {
  PROPOSAL_SERVICES, PRICE_FIELDS, PROPOSAL_CATALOG, serviceLabel,
  loadPriceBook, savePriceBookCache,
} from "../../../lib/proposal";
import { getPriceBookAction, savePriceBookAction } from "./proposal-actions";

const nice = (name) => name.replace(/^NVR \(|\)$/g, "").replace(/ Storage Drive$/, "");
const LABOR_NAMES = new Set(PRICE_FIELDS[0].names);
const NVR_NAMES = new Set(PRICE_FIELDS[1].names);
const HDD_NAMES = new Set(PRICE_FIELDS[2].names);

// Sections to render: `scopeKey` narrows to one service (a service's own gear icon);
// null shows every service (the header gear). Camera splits into 3 sub-groups because
// NVR models + storage drives are structurally locked (their names are pattern-matched
// by the NVR/HDD pickers) — everything else is a plain, fully-editable catalog list.
function sectionsFor(scopeKey) {
  const keys = scopeKey ? [scopeKey] : PROPOSAL_SERVICES.map((s) => s.key);
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

export default function PricingDefaults({ onClose, onSaved, scopeKey }) {
  const sections = sectionsFor(scopeKey);
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
    <div className="prc-backdrop" onClick={onClose}>
      <div className="prc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prc-head">
          <span className="prc-title">{title}</span>
          <button className="prc-x" onClick={onClose}>✕</button>
        </div>
        <div className="prc-sub">Company-wide, shared across your team. Changing a price or name only affects new imports and items added after this — not what's already placed.</div>
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
.pvx .prc-modal{background:#fff;border-radius:14px;width:min(520px,94vw);box-shadow:0 24px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
.pvx .prc-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 4px}
.pvx .prc-title{font-size:1.05rem;font-weight:800;color:var(--ink)}
.pvx .prc-x{background:none;border:none;font-size:1rem;color:var(--muted);cursor:pointer}
.pvx .prc-x:hover{color:var(--red)}
.pvx .prc-sub{font-size:.78rem;color:var(--muted);padding:0 22px 14px;line-height:1.45}
.pvx .prc-err{margin:0 22px 12px;padding:8px 11px;border-radius:8px;background:var(--red-soft);color:var(--red);font-size:.78rem;font-weight:700}
.pvx .prc-body{padding:0 22px 16px;display:flex;flex-direction:column;gap:12px}
.pvx .prc-group{border:1px solid #c9c2b2;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(11,15,26,.05)}
.pvx .prc-group-h{display:flex;align-items:center;gap:8px;width:100%;background:var(--bg-soft);border:none;border-bottom:1px solid transparent;padding:11px 14px;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--gold-deep);cursor:pointer;font-family:inherit;text-align:left}
.pvx .prc-group-h:hover{background:var(--bg-tint)}
.pvx .prc-group-h[aria-expanded="true"]{border-bottom-color:#c9c2b2}
.pvx .prc-chev{color:var(--gold-deep);font-size:.68rem}
.pvx .prc-count{margin-left:auto;font-size:.66rem;font-weight:700;color:var(--muted);text-transform:none;letter-spacing:0}
.pvx .prc-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--line)}
.pvx .prc-row:first-of-type{border-top:none}
.pvx .prc-name-in{flex:1;height:32px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:0 10px;font-size:.82rem;font-weight:600;color:var(--ink);font-family:inherit;outline:none;min-width:0}
.pvx .prc-name-in:disabled{background:var(--bg-soft);color:var(--muted);border-color:transparent}
.pvx .prc-name-in:focus{border-color:var(--gold)}
.pvx .prc-input{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--line);border-radius:8px;padding:0 8px;background:var(--bg-soft);flex-shrink:0}
.pvx .prc-input:focus-within{border-color:var(--gold)}
.pvx .prc-dollar{font-size:.8rem;font-weight:700;color:var(--muted)}
.pvx .prc-input input{width:64px;height:32px;border:none;background:transparent;text-align:right;font-size:.86rem;font-weight:700;color:var(--ink);font-family:inherit;outline:none}
.pvx .prc-input input::-webkit-outer-spin-button,.pvx .prc-input input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.pvx .prc-input input{-moz-appearance:textfield;appearance:textfield}
.pvx .prc-rm{background:none;border:none;color:var(--muted);font-size:.85rem;cursor:pointer;flex-shrink:0;padding:4px 6px}
.pvx .prc-rm:hover{color:var(--red)}
.pvx .prc-addrow{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px dashed var(--line);background:var(--bg-soft)}
.pvx .prc-add{height:30px;padding:0 12px;border:1px solid var(--gold);border-radius:7px;background:#fff;color:var(--gold-deep);font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0}
.pvx .prc-add:hover{background:var(--gold);color:#fff}
.pvx .prc-acts{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-top:1px solid var(--line)}
.pvx .prc-reset{background:none;border:none;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prc-reset:hover{color:var(--ink)}
.pvx .prc-save{height:38px;padding:0 22px;border:none;border-radius:9px;background:var(--gold);color:#fff;font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .prc-save:hover{background:var(--gold-deep)}
.pvx .prc-save:disabled{opacity:.6;cursor:default}
`;
