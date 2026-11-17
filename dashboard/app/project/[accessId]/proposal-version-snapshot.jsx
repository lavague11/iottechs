"use client";
// Read-only snapshot of one sent proposal version (or one add-on): items, money, plan, signature. Renders the
// view model from lib/proposal-version-snapshot.js — it computes nothing. Compare overlays the diff marks the
// server already attached (removed / changed lines, lines added since).
import { useState } from "react";

const $ = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => { if (!d) return ""; try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d).slice(0, 10); } };
const amt = (m) => (m ? (m.type === "pct" ? `${+m.value}%` : $(m.value)) : "");
const Svg = ({ children }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
export const Chevron = () => <Svg><path d="M9 6l6 6-6 6" /></Svg>;
const DownloadIcon = () => <Svg><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></Svg>;
const CompareIcon = () => <Svg><path d="M8 4v16" /><path d="M4 8l4-4 4 4" /><path d="M16 20V4" /><path d="M12 16l4 4 4-4" /></Svg>;

function Line({ it, compare }) {
  const cls = compare && it.mark === "removed" ? "rm" : compare && it.mark === "changed" ? "chg" : "";
  return (
    <>
      <div className={`pvs-li ${cls}`}>
        <span className="pvs-n">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}{it.waived ? " · waived" : ""}</span>
        <b>{$(it.total)}</b>
      </div>
      {compare && it.mark === "changed" && <div className="pvs-li pvs-now"><span>now</span><b>{it.now.qty} × {$(it.now.price)}{it.now.waived ? " · waived" : ""}</b></div>}
    </>
  );
}

function Option({ o, compare, many }) {
  const t = o.totals;
  return (
    <div className="pvs-opt">
      {many && <div className="pvs-opt-h">{o.name}{o.selected ? " · chosen" : ""}</div>}
      {compare && o.optionRemoved && <div className="pvs-li rm"><span>Option gone</span></div>}
      {o.services.map((s, i) => (
        <div key={i}>
          <div className="pvs-svc">{s.name}</div>
          {s.items.map((it, j) => <Line key={it.id || j} it={it} compare={compare} />)}
        </div>
      ))}
      {compare && o.addedSince?.length > 0 && <div className="pvs-svc">Added since</div>}
      {compare && (o.addedSince || []).map((it, j) => <div key={j} className="pvs-li add"><span className="pvs-n">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span><b>{it.qty} × {$(it.price)}</b></div>)}
      <div className="pvs-sum">
        <div><span>Subtotal</span><b>{$(t.sub)}</b></div>
        {t.discount > 0 && <div><span>Discount</span><b>−{$(t.discount)}</b></div>}
        {t.pcpCredit > 0 && <div><span>PCP credit</span><b>−{$(t.pcpCredit)}</b></div>}
        {t.tax > 0 && <div><span>Tax</span><b>{$(t.tax)}</b></div>}
        <div className="pvs-grand"><span>Total</span><b>{$(t.grand)}</b></div>
        {compare && o.totalNow != null && <div className="pvs-now"><span>Total now</span><b>{$(o.totalNow)}</b></div>}
      </div>
      {o.plan.length > 0 && (
        <div className="pvs-plan">
          {o.plan.map((r, i) => <div key={i}><span>{r.pctLabel}{r.when ? ` ${r.when}` : ""}</span><b>{r.amount != null ? $(r.amount) : ""}</b></div>)}
        </div>
      )}
    </div>
  );
}

export default function VersionSnapshot({ snap, onDownload, busy }) {
  const [compare, setCompare] = useState(false);
  const c = snap.compare;
  if (snap.kind === "addendum") {
    return (
      <div className="pvs">
        <style>{CSS}</style>
        {snap.items.map((it, i) => <div key={i} className="pvs-li"><span className="pvs-n">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>{it.total != null && <b>{$(it.total)}</b>}</div>)}
        {snap.totals && (
          <div className="pvs-sum">
            {snap.totals.discount > 0 && <div><span>Discount</span><b>−{$(snap.totals.discount)}</b></div>}
            <div className="pvs-grand"><span>Total</span><b>{$(snap.totals.total)}</b></div>
          </div>
        )}
        {snap.edited && <div className="pvs-tag pvs-edited">Edited</div>}
        <Signature sig={snap.signature} />
      </div>
    );
  }
  return (
    <div className="pvs">
      <style>{CSS}</style>
      <div className="pvs-bar">
        {snap.notFrozen && <span className="pvs-tag">Not frozen</span>}
        <span className="pvs-sp" />
        {c && <button type="button" className={`pvs-btn${compare ? " on" : ""}`} aria-pressed={compare} aria-label="Compare to current" title="Compare" onClick={() => setCompare((v) => !v)}><CompareIcon /></button>}
        <button type="button" className="pvs-btn" disabled={busy} aria-label="Download PDF" title="Download" onClick={onDownload}><DownloadIcon /></button>
      </div>
      {snap.options.map((o) => <Option key={o.id} o={o} compare={compare && !!c} many={snap.options.length > 1} />)}
      {compare && c && (
        <div className="pvs-sum pvs-terms">
          {c.optionsAddedSince.map((n) => <div key={n} className="pvs-li add"><span>Option added · {n}</span></div>)}
          {c.discount && <div className="pvs-li chg"><span>Discount</span><b>{amt(c.discount.from)} → {amt(c.discount.to)}</b></div>}
          {c.pcp && <div className="pvs-li chg"><span>PCP credit</span><b>{amt(c.pcp.from)} → {amt(c.pcp.to)}</b></div>}
          {c.tax && <div className="pvs-li chg"><span>Tax</span><b>{c.tax.from}% → {c.tax.to}%</b></div>}
          {c.deposit && <div className="pvs-li chg"><span>Deposit</span><b>{c.deposit.from}% → {c.deposit.to}%</b></div>}
        </div>
      )}
      <Signature sig={snap.signature} />
    </div>
  );
}

function Signature({ sig }) {
  if (!sig) return null;
  return (
    <div className="pvs-sig">
      {sig.data && /^data:image\//.test(sig.data) && <img src={sig.data} alt="Signature" />}
      <span>{sig.name || "Signed"}{sig.at ? ` · ${fmtD(sig.at)}` : ""}</span>
    </div>
  );
}

const CSS = `
.pvs{padding:6px 0 14px 42px;font-size:13px;color:var(--dv-ink,var(--ink,#101418))}
.pvs-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.pvs-sp{flex:1}
.pvs-edited{margin-top:8px}
.pvs-tag{font-size:11px;font-weight:700;color:var(--dv-meta,var(--meta,#787D84))}
.pvs-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:32px;padding:0;border:1px solid var(--dv-line,var(--line,#E4E4DF));border-radius:var(--r-sm,8px);background:var(--dv-raise,transparent);color:inherit;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.pvs-btn:hover{border-color:var(--dv-gold,#C9A96E)}
.pvs-btn.on{border-color:var(--dv-gold,#C9A96E)}
.pvs-btn:disabled{opacity:.5;cursor:default}
.pvs-opt{margin-bottom:12px}
.pvs-opt-h{font-weight:800;margin:6px 0}
.pvs-svc{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,var(--meta,#787D84));margin:8px 0 2px}
.pvs-li,.pvs-sum>div,.pvs-plan>div{display:flex;justify-content:space-between;gap:12px;padding:3px 0 3px 8px;font-variant-numeric:tabular-nums}
.pvs-li{border-left:3px solid transparent}
.pvs-li.add{border-left-color:var(--dv-green,#2E7D5B)}
.pvs-li.rm{border-left-color:var(--dv-red,#C4553D);text-decoration:line-through;color:var(--dv-meta,var(--meta,#787D84))}
.pvs-li.chg{border-left-color:var(--dv-gold,#C9A96E)}
.pvs-now{color:var(--dv-meta,var(--meta,#787D84))}
.pvs-sum{border-top:1px solid var(--dv-line,var(--line,#EDEDE9));margin-top:6px;padding-top:4px}
.pvs-grand{font-weight:800}
.pvs-plan{margin-top:6px;color:var(--dv-meta,var(--meta,#787D84))}
.pvs-sig{display:flex;align-items:center;gap:10px;margin-top:8px;color:var(--dv-meta,var(--meta,#787D84))}
.pvs-sig img{height:34px;max-width:160px;object-fit:contain}
`;
