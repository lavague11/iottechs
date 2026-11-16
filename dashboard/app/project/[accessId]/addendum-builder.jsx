"use client";
import { useState, useEffect, useMemo } from "react";
import { addendumTotals, serviceLabel, titleCase } from "../../../lib/proposal";
import { servicesToAddendumItems, addendumItemsToServices } from "../../../lib/addendum-items";
import { getRatesAction } from "./proposal-actions";
import ProposalItemsEditor from "./proposal-items-editor";
import ServiceAdder from "./service-adder";
import { PROP_CSS } from "./proposal-panel";

// The Addendum's item builder. It is the Proposal's own editor — the same + Add Service picker, the same
// + Item type-ahead over the catalog (price + tech pay auto-fill), the same preset chips — fed a services[]
// held in local state. lib/addendum-items.js turns that into the flat addendum items[] on every render; the
// total comes from addendumTotals (never re-derived here). Pricing inputs only exist for a role that may
// price (addendum.price); everyone else logs the work and the office prices it — enforced server-side too.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AddendumBuilder({ accessId, canPrice, editing, init, busy, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle] = useState(init?.title || "");
  const [services, setServices] = useState(() => addendumItemsToServices(init?.items));
  const [discount, setDiscount] = useState(init?.discount || "");
  const [payOv, setPayOv] = useState({});     // office-typed per-line tech pay, keyed by line id
  const [rates, setRates] = useState(null);   // company rate book -> default tech pay (office only)

  useEffect(() => {
    if (!canPrice) return;
    let live = true;
    getRatesAction(accessId).then((r) => { if (live && r?.ok && r.effective) setRates(r.effective); }).catch(() => {});
    return () => { live = false; };
  }, [accessId, canPrice]);

  const items = useMemo(
    () => servicesToAddendumItems(services, { rates, priced: canPrice, payOverrides: payOv, original: init?.items }),
    [services, rates, canPrice, payOv, init],
  );
  const total = addendumTotals({ items, discount }).total;

  const addService = (key, customLabel) => {
    if (!key) return;
    const label = (typeof customLabel === "string" && customLabel.trim()) || serviceLabel(key);
    setServices((s) => [...s, { key, label, items: [], note: "" }]);
  };
  const patchService = (i, next) => setServices((s) => s.map((x, j) => (j === i ? next : x)));
  const removeService = (i) => setServices((s) => s.filter((_, j) => j !== i));
  const payValue = (it) => (payOv[it.id] != null ? payOv[it.id] : (it.techPay || ""));

  return (
    <div className={`adn-builder`}>
      <style>{PROP_CSS}</style>
      <style>{BUILDER_CSS}</style>
      {editing && <div className="adn-b-editing">Pricing</div>}
      <input className="adn-b-title" aria-label="Title" placeholder="Title" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />

      {services.length > 0 && (
        <div className="prop-wrap adn-prop">
          {services.map((s, i) => (
            <ProposalItemsEditor key={s.key + i} svc={s} showCost={false} readOnly={false} priceBookVersion={0} hidePrices={!canPrice}
              onChange={(next) => patchService(i, next)} onRemove={() => removeService(i)} />
          ))}
        </div>
      )}

      <div className="adn-b-act">
        <ServiceAdder label="+ Add Service" primary={services.length === 0} onPick={addService} />
        {canPrice && (
          <label className="adn-b-disc">
            <span className="adn-flbl">Discount</span>
            <span className="adn-money"><span className="adn-cur">$</span>
              <input type="number" min="0" step="1" inputMode="decimal" placeholder="0" aria-label="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} /></span>
          </label>
        )}
      </div>

      {canPrice && items.length > 0 && (
        <details className="adn-pay">
          <summary>Tech pay <b>{money(items.reduce((s, it) => s + (+it.qty || 0) * (+it.techPay || 0), 0))}</b></summary>
          {items.map((it) => (
            <label key={it.id} className="adn-pay-row">
              <span>{titleCase(it.name)}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
              <span className="adn-money tech"><span className="adn-cur">$</span>
                <input type="number" min="0" step="1" inputMode="decimal" placeholder="0" aria-label={`Tech pay ${it.name}`}
                  value={payValue(it)} onChange={(e) => setPayOv((o) => ({ ...o, [it.id]: e.target.value }))} /></span>
            </label>
          ))}
        </details>
      )}

      <div className="adn-b-final">
        {canPrice ? (
          <div className="adn-b-totalblock">
            <span className="adn-flbl">Total</span>
            <b className="adn-b-tval">{money(total)}</b>
          </div>
        ) : (
          <div className="adn-b-note">Office will price this.</div>
        )}
        <button type="button" className="adn-b-create" disabled={busy || !items.length}
          onClick={() => onSubmit({ title: title.trim(), items, discount: +discount || 0 })}>{submitLabel}</button>
        <button type="button" className="adn-b-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const BUILDER_CSS = `
.adn-builder{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-paper,#F4F4F2);padding:14px;margin-top:6px;display:flex;flex-direction:column;gap:12px}
.adn-fld,.adn-b-disc{display:flex;flex-direction:column;gap:5px;min-width:0}
.adn-flbl{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.adn-b-title{height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 11px;font-size:.86rem;font-weight:600;font-family:inherit;outline:none;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);width:100%}
.adn-b-title:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .adn-root .adn-prop{margin:0}
.adn-b-act{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.adn-b-disc .adn-money{width:118px}
.adn-money{display:flex;align-items:center;height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);padding-left:10px;gap:1px}
.adn-money:focus-within{border-color:var(--dv-gold-text,#8A6A1F)}
.adn-cur{color:var(--dv-meta,#787D84);font-weight:600;font-size:.86rem;flex:0 0 auto}
.adn-money.tech .adn-cur{color:var(--dv-gold-text,#8A6A1F)}
.adn-money input{flex:1 1 0;min-width:0;height:100%;border:none;background:transparent;text-align:right;padding:0 10px 0 2px;font-size:.9rem;font-family:inherit;color:var(--dv-ink,#101418);outline:none;font-variant-numeric:tabular-nums}
.adn-pay summary{cursor:pointer;font-size:.78rem;font-weight:600;color:var(--dv-gold-text,#8A6A1F);list-style:none}
.adn-pay summary b{margin-left:6px;font-variant-numeric:tabular-nums}
.adn-pay-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:8px;font-size:.82rem;color:var(--dv-ink-soft,#3A4048)}
.adn-pay-row .adn-money{width:118px;flex:0 0 auto}
.adn-b-final{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px;padding-top:13px;border-top:1px solid var(--dv-line,#E4E4DF)}
.adn-b-totalblock{display:flex;flex-direction:column;gap:2px;margin-right:auto}
.adn-b-note{margin-right:auto;font-size:.72rem;color:var(--dv-meta,#787D84)}
.adn-b-editing{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dv-gold-text,#8A6A1F);margin-bottom:-2px}
.adn-b-tval{font-size:1.15rem;font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;line-height:1}
.adn-root .adn-b-create{height:40px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:var(--dv-raise,#FBFBFA);font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-root .adn-b-create:hover{filter:brightness(1.12)}
.adn-root .adn-b-create:disabled{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-faint,#A1A6AC);cursor:not-allowed;filter:none}
.adn-b-cancel{height:40px;padding:0 12px;border:none;border-radius:9px;background:transparent;color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-b-cancel:hover{color:var(--dv-ink,#101418)}
`;
