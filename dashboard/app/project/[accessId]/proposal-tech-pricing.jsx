"use client";
import { useState, useMemo, useEffect } from "react";
import { titleCase, serviceColor, defaultTechPayout } from "../../../lib/proposal";
import { saveTechPricingAction, getRatesAction } from "./proposal-actions";
import RateLibrary from "./rate-library";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Admin/Manager panel (work-order stage) to set the TECHNICIAN payout per line — the internal
// labor/equipment doc the tech signs. Laid out like the proposal itself: one block per service,
// items with their sub-lines, a payout input on every row. Reads the admin-sanitized proposal
// (already carries techPrice, auto-seeded from the standard rates when the proposal was sent) and
// saves an { itemId: techPrice } map in place via saveTechPricingAction — no new customer version,
// customer numbers untouched. The gear opens the standard-rate library; "Reset to standard" re-pulls
// those rates onto every line. Operates on the selected option (or the first if none selected yet).
export default function TechPricingEditor({ accessId, proposal, onSaved }) {
  const opt = useMemo(() => {
    const opts = proposal?.payload?.options || [];
    return opts.find((o) => o.id === proposal?.selected_option) || opts[0] || null;
  }, [proposal]);

  // Current techPrice per line, as editable strings.
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
  const [open, setOpen] = useState(false);       // start collapsed — part of the compact flow
  const [ratesOpen, setRatesOpen] = useState(false);
  const [expanded, setExpanded] = useState({});  // mobile: which item cards are open (collapsed by default)
  const [rates, setRates] = useState(null);      // effective standard rates (for reset + placeholders)

  useEffect(() => { setTech(initial); }, [initial]);
  const loadRates = () => getRatesAction(accessId).then((r) => {
    if (r?.ok) setRates({ ...(r.defaults || {}), ...(r.book?.default || {}) });
  }).catch(() => {});
  useEffect(() => { loadRates(); }, [accessId]);

  if (!opt) return null;

  // Every editable line, grouped by service block (matches the proposal layout). `items` keeps the
  // parent/child grouping (for the mobile cards); `rows` is the flattened parent+sub list (desktop table).
  const blocks = (opt.services || []).map((s) => {
    const items = (s.items || []).map((it) => ({
      id: it.id, name: titleCase(it.name), qty: it.qty, custPrice: it.price, svc: s.key,
      sub: (it.sub || []).map((x) => ({ id: x.id, name: titleCase(x.name), qty: x.qty, custPrice: x.price, svc: s.key })),
    }));
    const rows = items.flatMap((it) => [
      { id: it.id, name: it.name, qty: it.qty, custPrice: it.custPrice, svc: it.svc, header: it.sub.length > 0 },
      ...it.sub.map((x) => ({ ...x, sub: true })),
    ]);
    return { key: s.key, label: s.label, color: serviceColor(s.key), items, rows };
  }).filter((b) => b.rows.length);

  const lineTotal = (id, qty) => (+qty || 0) * (+tech[id] || 0);
  const itemTechTotal = (it) => it.sub.length ? it.sub.reduce((s, x) => s + lineTotal(x.id, x.qty), 0) : lineTotal(it.id, it.qty);
  const blockTotal = (b) => b.rows.reduce((s, r) => (r.header ? s : s + lineTotal(r.id, r.qty)), 0);
  const total = blocks.reduce((s, b) => s + blockTotal(b), 0);
  const dirty = Object.keys({ ...initial, ...tech }).some((k) => (tech[k] || "") !== (initial[k] || ""));
  const stdRate = (r) => (rates ? defaultTechPayout(r.name, r.svc, rates) : 0);

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
  // Re-pull the company standard rates onto every line (admin can then tweak + save).
  function resetToStandard() {
    if (!rates) return;
    const next = {};
    blocks.forEach((b) => b.rows.forEach((r) => { if (!r.header) next[r.id] = String(defaultTechPayout(r.name, r.svc, rates)); }));
    setTech(next);
  }

  return (
    <div className="tpx-card">
      <style>{TPX_CSS}</style>
      <button type="button" className="tpx-head" onClick={() => setOpen((o) => !o)}>
        <span className="tpx-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </span>
        <span className="tpx-title">Technician Work Order Pricing</span>
        <span className="tpx-sub">{proposal.payload.options.length > 1 ? `Option ${opt.id} · ` : ""}<span className="tpx-sub-lbl">Tech payout </span>{money(total)}</span>
        <span className="tpx-chev">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="tpx-body">
          <div className="tpx-note-row">
            <div className="tpx-note">Auto-filled from your rates · override any line.</div>
            <button type="button" className="tpx-gear" title="Edit standard rates" onClick={() => setRatesOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Standard rates
            </button>
          </div>
          {err && <div className="tpx-err">{err}</div>}

          <div className="tpx-blocks">
            {blocks.map((b) => (
              <div key={b.key} className="tpx-block" style={{ "--tc": b.color }}>
                <div className="tpx-block-hd">
                  <span className="tpx-block-dot" />
                  <span className="tpx-block-name">{b.label}</span>
                  <span className="tpx-block-tot">{money(blockTotal(b))}<span className="tpx-block-tot-lbl"> payout</span></span>
                </div>

                {/* Desktop / tablet: the multi-column table. */}
                <div className="tpx-table">
                  <div className="tpx-thead"><span>Item</span><span className="r">Qty</span><span className="r">Customer</span><span className="r">Tech Rate</span><span className="r">Tech Total</span></div>
                  {b.rows.map((r) => (
                    <div key={r.id} className={`tpx-row${r.sub ? " sub" : ""}${r.header ? " header" : ""}`}>
                      <span className="tpx-name">{r.sub ? "· " : ""}{r.name}</span>
                      <span className="r tpx-muted">{r.header ? "" : r.qty}</span>
                      <span className="r tpx-muted">{r.header ? "" : money(r.custPrice)}</span>
                      <span className="r">
                        {r.header ? <span className="tpx-muted">—</span> : (
                          <span className="tpx-inp"><span>$</span>
                            <input type="number" min="0" step="0.01" value={tech[r.id] ?? ""}
                                   placeholder={rates ? String(stdRate(r)) : "0"}
                                   onChange={(e) => setTech((m) => ({ ...m, [r.id]: e.target.value }))} />
                          </span>
                        )}
                      </span>
                      <span className="r tpx-tot">{r.header ? "" : money(lineTotal(r.id, r.qty))}</span>
                    </div>
                  ))}
                </div>

                {/* Mobile: one card per item; multi-step items collapse (default closed) so a 16-camera
                    job isn't a giant scroll. Customer price is read-only reference; Tech pay is the field. */}
                <div className="tpx-cards">
                  {b.items.map((it) => {
                    const techField = (id) => (
                      <span className="tpx-inp"><span>$</span>
                        <input type="number" min="0" step="0.01" value={tech[id] ?? ""}
                               placeholder={rates ? String(stdRate({ name: it.name, svc: it.svc })) : "0"}
                               onChange={(e) => setTech((m) => ({ ...m, [id]: e.target.value }))} /></span>
                    );
                    if (!it.sub.length) return (
                      <div key={it.id} className="tpx-cam solo">
                        <div className="tpx-cam-hd static">
                          <span className="tpx-cam-name">{it.name}</span>
                          <span className="tpx-cam-steps">Qty {it.qty}</span>
                          <span className="tpx-cam-tot">{money(itemTechTotal(it))}</span>
                        </div>
                        <div className="tpx-step-pay">
                          <span className="tpx-pay"><span className="tpx-pay-lbl">Customer</span><span className="tpx-pay-cval">{money(it.custPrice)}</span></span>
                          <span className="tpx-pay tech"><span className="tpx-pay-lbl">Tech pay</span>{techField(it.id)}</span>
                        </div>
                      </div>
                    );
                    const isOpen = !!expanded[it.id];
                    return (
                      <div key={it.id} className={`tpx-cam${isOpen ? " open" : ""}`}>
                        <button type="button" className="tpx-cam-hd" aria-expanded={isOpen}
                                onClick={() => setExpanded((m) => ({ ...m, [it.id]: !m[it.id] }))}>
                          <span className="tpx-cam-name">{it.name}</span>
                          <span className="tpx-cam-steps">{it.sub.length} steps</span>
                          <span className="tpx-cam-tot">{money(itemTechTotal(it))}</span>
                          <svg className="tpx-cam-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                        {isOpen && (
                          <div className="tpx-steps">
                            {it.sub.map((st) => (
                              <div key={st.id} className="tpx-step">
                                <div className="tpx-step-hd"><span className="tpx-step-name">{st.name}</span><span className="tpx-step-qty">Qty {st.qty}</span></div>
                                <div className="tpx-step-pay">
                                  <span className="tpx-pay"><span className="tpx-pay-lbl">Customer</span><span className="tpx-pay-cval">{money(st.custPrice)}</span></span>
                                  <span className="tpx-pay tech"><span className="tpx-pay-lbl">Tech pay</span>
                                    <span className="tpx-inp"><span>$</span>
                                      <input type="number" min="0" step="0.01" value={tech[st.id] ?? ""}
                                             placeholder={rates ? String(stdRate(st)) : "0"}
                                             onChange={(e) => setTech((m) => ({ ...m, [st.id]: e.target.value }))} /></span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="tpx-foot">
            <span className="tpx-grand">Work Order Total <b>{money(total)}</b></span>
            <button type="button" className="tpx-reset" disabled={!rates} onClick={resetToStandard} title="Re-pull the company standard rates onto every line">↺ Reset to standard</button>
            {savedAt && !dirty && <span className="tpx-saved">Saved</span>}
            <button className="tpx-save" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save Tech Pricing"}</button>
          </div>
        </div>
      )}

      <RateLibrary open={ratesOpen} accessId={accessId} onClose={() => setRatesOpen(false)} onSaved={() => loadRates()} />
    </div>
  );
}

const TPX_CSS = `
.tpx-card{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA);overflow:hidden;margin:0}
.tpx-head{width:100%;display:flex;align-items:center;gap:10px;padding:13px 14px;background:var(--dv-raise,#FBFBFA);border:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s}
.tpx-head:hover{background:var(--dv-paper,#F4F4F2)}
.tpx-icon{width:30px;height:30px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--dv-green,#2E7D5B);background:#e9f3ed;border:1px solid #cfe6d8}
.tpx-title{flex:1 1 0;min-width:0;font-family:inherit;font-weight:600;font-size:14.5px;line-height:1.25;color:var(--dv-ink,#101418)}
.tpx-sub{flex-shrink:0;font-size:.72rem;font-weight:600;letter-spacing:.02em;color:var(--dv-green,#2E7D5B);padding:4px 10px;border-radius:100px;background:#e9f3ed;white-space:nowrap}
.tpx-chev{flex-shrink:0;margin-left:4px;font-size:.7rem;color:var(--dv-faint,#A1A6AC)}
@media (max-width:600px){
  .tpx-head{gap:8px;padding:11px 12px}
  .tpx-title{font-size:13.5px}
  .tpx-sub{padding:3px 9px;font-size:.7rem}
  .tpx-sub-lbl{display:none}   /* drop "Tech payout" label on mobile — just the $ — so the title keeps one line */
  .tpx-body{padding:12px 13px}
  .tpx-note-row{gap:10px;margin-bottom:10px}
  .tpx-table{display:none}     /* the 5-col grid can't fit a phone — use the stacked cards instead */
  .tpx-cards{display:flex;flex-direction:column}
}
.tpx-body{padding:14px 16px}
.tpx-note-row{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}
.tpx-note{font-size:.76rem;color:var(--dv-meta,#787D84);line-height:1.45;flex:1}
.tpx-gear{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.tpx-gear:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.tpx-gear svg{opacity:.75}
.tpx-err{margin-bottom:10px;padding:8px 11px;border-radius:8px;background:#fbe9e6;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
.tpx-blocks{display:flex;flex-direction:column;gap:12px}
.tpx-block{border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid var(--tc,var(--dv-gold,#C9A96E));border-radius:10px;overflow:hidden;background:#fff}
.tpx-block-hd{display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--dv-paper,#F4F4F2);border-bottom:1px solid var(--dv-line,#E4E4DF)}
.tpx-block-dot{width:9px;height:9px;border-radius:3px;background:var(--tc,var(--dv-gold,#C9A96E));flex-shrink:0}
.tpx-block-name{font-size:.82rem;font-weight:700;color:var(--dv-ink,#101418)}
.tpx-block-tot{margin-left:auto;font-size:.8rem;font-weight:700;color:var(--dv-green,#2E7D5B)}
.tpx-thead{display:grid;grid-template-columns:1fr 46px 84px 104px 92px;gap:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.64rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:7px 12px;border-bottom:1px solid var(--dv-line-soft,#EDEDE9)}
.tpx-thead .r{text-align:right}
.tpx-row{display:grid;grid-template-columns:1fr 46px 84px 104px 92px;gap:8px;align-items:center;padding:6px 12px;border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.8rem;color:var(--dv-ink,#101418)}
.tpx-row.header{background:var(--dv-paper,#F4F4F2);font-weight:600}
.tpx-row.sub{color:var(--dv-meta,#787D84);font-size:.76rem;padding-left:22px}
.tpx-name{display:flex;align-items:center;gap:7px;min-width:0}
.tpx-muted{color:var(--dv-meta,#787D84)}
.r{text-align:right}
.tpx-tot{font-weight:700}
.tpx-inp{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;padding:0 8px;background:#fff}
.tpx-inp:focus-within{border-color:var(--dv-gold,#C9A96E)}
.tpx-inp span{font-size:.76rem;font-weight:600;color:var(--dv-meta,#787D84)}
.tpx-inp input{width:60px;height:28px;border:none;outline:none;text-align:right;font-size:.82rem;font-weight:700;color:var(--dv-ink,#101418);font-family:inherit;background:transparent}
.tpx-inp input::placeholder{color:var(--dv-faint,#A1A6AC);font-weight:500}
.tpx-inp input::-webkit-outer-spin-button,.tpx-inp input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.tpx-inp input{-moz-appearance:textfield;appearance:textfield}
.tpx-foot{display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap}
.tpx-grand{font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418)}
.tpx-grand b{color:var(--dv-green,#2E7D5B);margin-left:6px;font-weight:700}
.tpx-reset{height:34px;padding:0 13px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.tpx-reset:hover:not(:disabled){border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.tpx-reset:disabled{opacity:.5;cursor:default}
.tpx-saved{font-size:.76rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.tpx-save{margin-left:auto;height:38px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
.tpx-save:hover{filter:brightness(1.12)}
.tpx-save:disabled{opacity:.5;cursor:default}
.tpx-block-tot-lbl{font-weight:500;color:var(--dv-meta,#787D84);font-size:.68rem;text-transform:uppercase;letter-spacing:.04em}
/* ---- Mobile stacked cards. Desktop hides them via a min-width query (not a bare rule, which would
   win on source-order over the max-width "show" rule above) ---- */
@media (min-width:601px){ .tpx-cards{display:none} }
.tpx-cam{border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.tpx-cam:first-child{border-top:none}
.tpx-cam-hd{width:100%;display:grid;grid-template-columns:1fr auto auto;grid-template-rows:auto auto;column-gap:10px;row-gap:1px;align-items:center;padding:11px 12px;background:none;border:none;font-family:inherit;text-align:left;cursor:pointer}
.tpx-cam-hd.static{cursor:default}
.tpx-cam-name{grid-column:1/2;grid-row:1;font-size:.88rem;font-weight:600;color:var(--dv-ink,#101418);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpx-cam-steps{grid-column:1/2;grid-row:2;font-size:.7rem;color:var(--dv-faint,#A1A6AC)}
.tpx-cam-tot{grid-column:2/3;grid-row:1/3;align-self:center;font-size:.9rem;font-weight:700;color:var(--dv-green,#2E7D5B);white-space:nowrap;font-variant-numeric:tabular-nums}
.tpx-cam-chev{grid-column:3/4;grid-row:1/3;align-self:center;color:var(--dv-faint,#A1A6AC);transition:transform .2s var(--dv-e,ease)}
.tpx-cam.open .tpx-cam-chev{transform:rotate(180deg)}
.tpx-cam.solo{padding-bottom:11px}
.tpx-cam.solo .tpx-step-pay{padding:0 12px}
.tpx-steps{display:flex;flex-direction:column;gap:8px;padding:1px 12px 12px}
.tpx-step{border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:9px 11px;background:var(--dv-raise,#FBFBFA)}
.tpx-step-hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px}
.tpx-step-name{font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418)}
.tpx-step-qty{font-size:.7rem;color:var(--dv-faint,#A1A6AC);white-space:nowrap}
.tpx-step-pay{display:flex;gap:10px}
.tpx-pay{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:4px}
.tpx-pay-lbl{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dv-meta,#787D84)}
.tpx-pay.tech .tpx-pay-lbl{color:var(--dv-gold-deep,#A8842F)}
.tpx-pay-cval{height:36px;display:flex;align-items:center;font-size:.9rem;font-weight:600;color:var(--dv-meta,#787D84);font-variant-numeric:tabular-nums}
.tpx-step-pay .tpx-inp{width:100%;height:36px;border-radius:8px}
.tpx-step-pay .tpx-inp input{width:100%;flex:1 1 0;height:100%;font-size:.9rem}
`;
