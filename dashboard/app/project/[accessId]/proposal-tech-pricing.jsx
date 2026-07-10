"use client";
import { useState, useMemo } from "react";
import { titleCase, serviceColor } from "../../../lib/proposal";
import { saveTechPricingAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Admin/Manager panel (install stage) to set the TECHNICIAN payout per line of the work order.
// Reads the admin-sanitized proposal (has techPrice already), edits it into a { itemId: techPrice }
// map, and saves in place via saveTechPricingAction — no new customer version. The tech then sees
// these figures in their Work Order (proposal-workorder-view.jsx). Customer price shown for
// reference only. Operates on the selected option (or the first if none selected yet).
export default function TechPricingEditor({ accessId, proposal, onSaved }) {
  const opt = useMemo(() => {
    const opts = proposal?.payload?.options || [];
    return opts.find((o) => o.id === proposal?.selected_option) || opts[0] || null;
  }, [proposal]);

  // Flat list of every editable row (top-level items + sub-items) for the option.
  const rows = useMemo(() => {
    if (!opt) return [];
    const out = [];
    (opt.services || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        const hasSub = (it.sub || []).length > 0;
        out.push({ id: it.id, name: titleCase(it.name), qty: it.qty, custPrice: it.price, svc: s.key, svcLabel: s.label, header: hasSub });
        (it.sub || []).forEach((x) => out.push({ id: x.id, name: titleCase(x.name), qty: x.qty, custPrice: x.price, svc: s.key, sub: true }));
      });
    });
    return out;
  }, [opt]);

  const initial = useMemo(() => {
    const m = {};
    if (opt) (opt.services || []).forEach((s) => (s.items || []).forEach((it) => {
      m[it.id] = it.techPrice != null ? String(it.techPrice) : "";
      (it.sub || []).forEach((x) => { m[x.id] = x.techPrice != null ? String(x.techPrice) : ""; });
    }));
    return m;
  }, [opt]);

  const [tech, setTech] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [open, setOpen] = useState(true);

  if (!opt) return null;

  const total = rows.reduce((s, r) => (r.header ? s : s + (+r.qty || 0) * (+tech[r.id] || 0)), 0);
  const dirty = Object.keys(tech).some((k) => (tech[k] || "") !== (initial[k] || ""));

  async function save() {
    setBusy(true); setErr(null);
    const map = {};
    Object.entries(tech).forEach(([id, v]) => { if (v !== "" && v != null) map[id] = +v || 0; });
    const r = await saveTechPricingAction(accessId, map);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setSavedAt(new Date());
    onSaved?.(r.proposal);
  }

  return (
    <div className="tpx-card">
      <style>{TPX_CSS}</style>
      <button type="button" className="tpx-head" onClick={() => setOpen((o) => !o)}>
        <span className="tpx-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </span>
        <span className="tpx-title">Technician Work Order Pricing</span>
        <span className="tpx-sub">{proposal.payload.options.length > 1 ? `Option ${opt.id} · ` : ""}Tech payout {money(total)}</span>
        <span className="tpx-chev">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="tpx-body">
          <div className="tpx-note">Set what the technician is paid per line. This is internal — the customer never sees it, and saving here does not change the customer proposal.</div>
          {err && <div className="tpx-err">{err}</div>}

          <div className="tpx-table">
            <div className="tpx-thead"><span>Item</span><span className="r">Qty</span><span className="r">Customer</span><span className="r">Tech Rate</span><span className="r">Tech Total</span></div>
            {rows.map((r) => (
              <div key={r.id} className={`tpx-row${r.sub ? " sub" : ""}${r.header ? " header" : ""}`}>
                <span className="tpx-name">
                  {!r.sub && <span className="tpx-dot" style={{ background: serviceColor(r.svc) }} />}
                  {r.sub ? "· " : ""}{r.name}
                </span>
                <span className="r tpx-muted">{r.header ? "" : r.qty}</span>
                <span className="r tpx-muted">{r.header ? "" : money(r.custPrice)}</span>
                <span className="r">
                  {r.header ? <span className="tpx-muted">—</span> : (
                    <span className="tpx-inp"><span>$</span>
                      <input type="number" min="0" step="0.01" value={tech[r.id] ?? ""} placeholder="0"
                             onChange={(e) => setTech((m) => ({ ...m, [r.id]: e.target.value }))} />
                    </span>
                  )}
                </span>
                <span className="r tpx-tot">{r.header ? "" : money((+r.qty || 0) * (+tech[r.id] || 0))}</span>
              </div>
            ))}
          </div>

          <div className="tpx-foot">
            <span className="tpx-grand">Work Order Total <b>{money(total)}</b></span>
            {savedAt && !dirty && <span className="tpx-saved">Saved</span>}
            <button className="tpx-save" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save Tech Pricing"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const TPX_CSS = `
.tpx-card{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden;margin-bottom:18px}
.tpx-head{width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--bg-soft,#f5f5f7);border:none;cursor:pointer;font-family:inherit;text-align:left}
.tpx-icon{display:inline-grid;place-items:center;color:var(--tech,#2f7d5a)}
.tpx-title{font-size:.86rem;font-weight:800;color:var(--ink)}
.tpx-sub{font-size:.76rem;font-weight:700;color:var(--tech,#2f7d5a);margin-left:6px}
.tpx-chev{margin-left:auto;font-size:.7rem;color:var(--muted)}
.tpx-body{padding:14px 16px}
.tpx-note{font-size:.76rem;color:var(--muted);margin-bottom:12px;line-height:1.45}
.tpx-err{margin-bottom:10px;padding:8px 11px;border-radius:8px;background:#fbe6e4;color:#a8442f;font-size:.78rem;font-weight:700}
.tpx-table{border:1px solid var(--line);border-radius:10px;overflow:hidden}
.tpx-thead{display:grid;grid-template-columns:1fr 50px 90px 110px 100px;gap:8px;background:#2C3347;color:#FAF8F4;font-size:.68rem;font-weight:700;padding:8px 12px}
.tpx-thead .r{text-align:right}
.tpx-row{display:grid;grid-template-columns:1fr 50px 90px 110px 100px;gap:8px;align-items:center;padding:6px 12px;border-top:1px solid var(--line);font-size:.8rem;color:var(--ink)}
.tpx-row.header{background:var(--bg-soft,#f5f5f7);font-weight:800}
.tpx-row.sub{background:#fff;color:var(--muted);font-size:.76rem;padding-left:22px}
.tpx-name{display:flex;align-items:center;gap:7px;min-width:0}
.tpx-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0}
.tpx-muted{color:var(--muted)}
.r{text-align:right}
.tpx-tot{font-weight:700}
.tpx-inp{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--line);border-radius:7px;padding:0 8px;background:#fff}
.tpx-inp:focus-within{border-color:var(--tech,#2f7d5a)}
.tpx-inp span{font-size:.76rem;font-weight:700;color:var(--muted)}
.tpx-inp input{width:64px;height:28px;border:none;outline:none;text-align:right;font-size:.82rem;font-weight:700;color:var(--ink);font-family:inherit;background:transparent}
.tpx-inp input::-webkit-outer-spin-button,.tpx-inp input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.tpx-inp input{-moz-appearance:textfield;appearance:textfield}
.tpx-foot{display:flex;align-items:center;gap:14px;margin-top:14px}
.tpx-grand{font-size:.86rem;font-weight:700;color:var(--ink)}
.tpx-grand b{color:var(--tech,#2f7d5a);margin-left:6px}
.tpx-saved{font-size:.76rem;font-weight:700;color:var(--tech,#2f7d5a)}
.tpx-save{margin-left:auto;height:38px;padding:0 20px;border:none;border-radius:9px;background:var(--tech,#2f7d5a);color:#fff;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.tpx-save:hover{filter:brightness(1.05)}
.tpx-save:disabled{opacity:.5;cursor:default}
`;
