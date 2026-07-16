"use client";
import { useState, useEffect } from "react";
import {
  effectiveCatalog, serviceLabel, loadPriceBook, loadPresets, savePriceBookCache, priceOf,
} from "../../../lib/proposal";
import { getPriceBookAction, savePriceBookAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Preset bundle manager for ONE service. A preset is a named group of catalog items that
// drops as a single line block (header + sub-items) from the builder's add bar — e.g.
// "Full Camera Install" = Camera + Cat6 drop + termination + mounting + programming + waterproofing.
export default function PresetEditor({ serviceKey, onClose, onSaved }) {
  // Materialize the merged presets (seed defaults + saved) into an editable array up front.
  const [book, setBook] = useState(() => { const b = loadPriceBook(); return { ...b, presets: loadPresets(b).map((p) => ({ ...p, items: [...(p.items || [])] })) }; });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getPriceBookAction().then((r) => {
      if (live && r?.ok) { savePriceBookCache(r.book); setBook({ ...r.book, presets: loadPresets(r.book).map((p) => ({ ...p, items: [...(p.items || [])] })) }); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const catalog = effectiveCatalog(serviceKey, book).filter((c) => !c.locked); // no NVR/drive lines in a labor preset
  const svcPresets = (book.presets || []).filter((p) => p.service === serviceKey);

  const mutate = (fn) => setBook((b) => ({ ...b, presets: fn(b.presets || []) }));
  const patchPreset = (id, patch) => mutate((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPreset = () => mutate((list) => [...list, { id: newId(), name: "New bundle", service: serviceKey, items: [] }]);
  const delPreset = (id) => mutate((list) => list.filter((p) => p.id !== id));
  const addItem = (id, name) => { if (!name) return; patchPreset(id, { items: [...(svcPresets.find((p) => p.id === id)?.items || []), { name, qty: 1 }] }); };
  const patchItem = (id, idx, patch) => patchPreset(id, { items: (svcPresets.find((p) => p.id === id)?.items || []).map((x, i) => (i === idx ? { ...x, ...patch } : x)) });
  const delItem = (id, idx) => patchPreset(id, { items: (svcPresets.find((p) => p.id === id)?.items || []).filter((_, i) => i !== idx) });

  const presetTotal = (p) => (p.items || []).reduce((s, x) => s + (+x.qty || 1) * priceOf(x.name, book), 0);

  async function save() {
    setBusy(true); setErr(null);
    const r = await savePriceBookAction(book);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    savePriceBookCache(r.book);
    onSaved?.(r.book);
  }

  return (
    <div className="pst-backdrop" onClick={onClose}>
      <div className="pst-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pst-head">
          <span className="pst-title">Preset bundles · {serviceLabel(serviceKey)}</span>
          <button className="pst-x" onClick={onClose}>✕</button>
        </div>
        <div className="pst-sub">One-click line bundles. Each drops as a block with its sub-items, priced from your catalog. Shown at the top of the add bar.</div>
        {err && <div className="pst-err">{err}</div>}

        <div className="pst-body">
          {svcPresets.length === 0 && <div className="pst-empty">No presets yet — add one below.</div>}
          {svcPresets.map((p) => (
            <div key={p.id} className="pst-card">
              <div className="pst-card-h">
                <input className="pst-name-in" value={p.name} placeholder="Bundle name" onChange={(e) => patchPreset(p.id, { name: e.target.value })} />
                <span className="pst-card-total">{money(presetTotal(p))}</span>
                <button className="pst-del" title="Delete preset" onClick={() => delPreset(p.id)}>✕</button>
              </div>
              {(p.items || []).map((x, i) => (
                <div key={i} className="pst-item">
                  <span className="pst-item-name">{x.name}</span>
                  <span className="pst-item-price">{money(priceOf(x.name, book))}</span>
                  <input className="pst-qty" type="number" min="1" value={x.qty} title="Quantity"
                         onChange={(e) => patchItem(p.id, i, { qty: e.target.value })} />
                  <button className="pst-item-x" title="Remove" onClick={() => delItem(p.id, i)}>✕</button>
                </div>
              ))}
              <div className="pst-additem">
                <select value="" onChange={(e) => { addItem(p.id, e.target.value); e.target.value = ""; }}>
                  <option value="" disabled>+ Add item…</option>
                  {catalog.map((c) => <option key={c.name} value={c.baseName || c.name}>{c.name} · {money(c.price)}</option>)}
                </select>
              </div>
            </div>
          ))}
          <button className="pst-new" onClick={addPreset}>+ New preset</button>
        </div>

        <div className="pst-acts">
          <span className="pst-hint">Company-wide — shared across your team.</span>
          <button className="pst-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <style>{PST_CSS}</style>
    </div>
  );
}

const PST_CSS = `
.pvx .pst-backdrop{position:fixed;inset:0;z-index:10600;background:rgba(11,15,26,.5);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
.pvx .pst-modal{background:#fff;border-radius:14px;width:min(540px,94vw);box-shadow:0 24px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
.pvx .pst-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 4px}
.pvx .pst-title{font-size:1.05rem;font-weight:800;color:var(--ink)}
.pvx .pst-x{background:none;border:none;font-size:1rem;color:var(--muted);cursor:pointer}
.pvx .pst-x:hover{color:var(--red)}
.pvx .pst-sub{font-size:.78rem;color:var(--muted);padding:0 22px 14px;line-height:1.45}
.pvx .pst-err{margin:0 22px 12px;padding:8px 11px;border-radius:8px;background:var(--red-soft);color:var(--red);font-size:.78rem;font-weight:700}
.pvx .pst-body{padding:0 22px 16px;display:flex;flex-direction:column;gap:12px}
.pvx .pst-empty{font-size:.82rem;color:var(--muted);padding:6px 2px}
.pvx .pst-card{border:1px solid #c9c2b2;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(11,15,26,.05)}
.pvx .pst-card-h{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg-soft);border-bottom:1px solid #e6e1d4}
.pvx .pst-name-in{flex:1;height:32px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:0 10px;font-size:.86rem;font-weight:800;color:var(--ink);font-family:inherit;outline:none;min-width:0}
.pvx .pst-name-in:focus{border-color:var(--gold)}
.pvx .pst-card-total{font-size:.82rem;font-weight:800;color:var(--gold-deep);white-space:nowrap}
.pvx .pst-del{background:none;border:none;color:var(--muted);font-size:.9rem;cursor:pointer;flex-shrink:0;padding:2px 4px}
.pvx .pst-del:hover{color:var(--red)}
.pvx .pst-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px dashed var(--line)}
.pvx .pst-item:first-of-type{border-top:none}
.pvx .pst-item-name{flex:1;font-size:.82rem;font-weight:600;color:var(--ink);text-transform:capitalize}
.pvx .pst-item-price{font-size:.78rem;font-weight:600;color:var(--muted);white-space:nowrap}
.pvx .pst-qty{width:52px;height:30px;border:1px solid var(--line);border-radius:7px;background:#fff;text-align:right;font-size:.82rem;font-weight:700;color:var(--ink);font-family:inherit;outline:none;padding:0 7px}
.pvx .pst-qty:focus{border-color:var(--gold)}
.pvx .pst-item-x{background:none;border:none;color:var(--muted);font-size:.85rem;cursor:pointer;flex-shrink:0}
.pvx .pst-item-x:hover{color:var(--red)}
.pvx .pst-additem{padding:9px 12px;border-top:1px dashed var(--line);background:var(--bg-soft)}
.pvx .pst-additem select{width:100%;height:32px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-size:.8rem;font-weight:600;font-family:inherit;padding:0 8px;cursor:pointer}
.pvx .pst-new{height:36px;border:1px dashed var(--gold);border-radius:9px;background:#fff;color:var(--gold-deep);font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .pst-new:hover{background:var(--gold);color:#fff;border-style:solid}
.pvx .pst-acts{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-top:1px solid var(--line)}
.pvx .pst-hint{font-size:.74rem;color:var(--muted)}
.pvx .pst-save{height:38px;padding:0 22px;border:none;border-radius:9px;background:var(--gold);color:#fff;font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .pst-save:hover{background:var(--gold-deep)}
.pvx .pst-save:disabled{opacity:.6;cursor:default}
`;
