"use client";
import { useState } from "react";
import { titleCase, serviceLabel, serviceColor, techItemTotal, techSvcSubtotal, techOptionTotal } from "../../../lib/proposal";

// Read-only Work Order sheet — a mirror of the proposal page (same service blocks + numbered line
// items), but every line is valued at its TECHNICIAN payout (`techPrice`) instead of the customer
// price. Titled "Work Order" with the service name underneath. Admin/manager only; it reads the
// admin-sanitized proposal that already carries techPrice (auto-seeded from the standard rates when
// the proposal was sent, then editable in the Tech Pricing editor). Purely presentational — it never
// writes, so it's safe to drop above the create/assign/finalize controls in the Work Order overlay.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WorkOrderSheet({ proposal }) {
  const opts = proposal?.payload?.options || [];
  const [optId, setOptId] = useState(proposal?.selected_option || opts[0]?.id);
  if (!opts.length) return null;
  const opt = opts.find((o) => o.id === optId) || opts[0];

  const blocks = (opt.services || []).map((s) => ({
    key: s.key, label: s.label || serviceLabel(s.key), color: serviceColor(s.key),
    items: (s.items || []).filter((it) => !it.waived),
    subtotal: techSvcSubtotal({ items: (s.items || []).filter((it) => !it.waived) }),
  })).filter((b) => b.items.length);

  const total = techOptionTotal({ services: blocks.map((b) => ({ items: b.items })) });
  const pending = total === 0;                    // no rates set yet → show TBD, not a wall of $0.00
  const rate = (n) => (pending ? "TBD" : money(n));
  const svcNames = blocks.map((b) => b.label).join(" · ");

  return (
    <div className="wos">
      <style>{WOS_CSS}</style>

      <div className="wos-top">
        <div className="wos-ttl">Work Order</div>
        {svcNames && <div className="wos-svc">{svcNames}</div>}
      </div>

      {opts.length > 1 && (
        <div className="wos-tabs">
          {opts.map((o) => (
            <button key={o.id} type="button" className={`wos-tab${o.id === opt.id ? " on" : ""}`} onClick={() => setOptId(o.id)}>
              {o.id} · {o.name}{proposal.selected_option === o.id ? <span className="wos-tab-dot" /> : null}
            </button>
          ))}
        </div>
      )}

      {blocks.map((b) => (
        <div key={b.key} className="wos-block" style={{ "--wc": b.color }}>
          <div className="wos-block-hd">
            <span className="wos-block-dot" />
            <span className="wos-block-name">{b.label}</span>
            <span className="wos-col">Payout</span>
          </div>
          <div className="wos-rows">
            {b.items.map((it, i) => {
              const subs = (it.sub || []);
              const grouped = subs.length > 0;
              return (
                <div key={it.id} className="wos-item">
                  <div className={`wos-row${grouped ? " head" : ""}`}>
                    <span className="wos-num">{i + 1}</span>
                    <span className="wos-name">{titleCase(it.name)}{!grouped && +it.qty > 1 ? <span className="wos-qty"> ×{it.qty}</span> : null}</span>
                    <span className="wos-amt">{rate(techItemTotal(it))}</span>
                  </div>
                  {grouped && subs.map((x) => (
                    <div key={x.id} className="wos-row sub">
                      <span className="wos-num" />
                      <span className="wos-name">{titleCase(x.name)}{+x.qty > 1 ? <span className="wos-qty"> ×{x.qty}</span> : null}</span>
                      <span className="wos-amt">{rate((+x.qty || 0) * (+x.techPrice || 0))}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {blocks.length > 1 && <div className="wos-sub"><span>{b.label} subtotal</span><span>{rate(b.subtotal)}</span></div>}
        </div>
      ))}

      <div className="wos-total">
        <span>Work Order Total</span>
        <span>{pending ? "TBD" : money(total)}</span>
      </div>
      {pending && <div className="wos-note">Payout rates pending — set them below.</div>}
    </div>
  );
}

const WOS_CSS = `
.wos{background:var(--dv-paper,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;overflow:hidden;font-family:inherit;margin-bottom:16px}
.wos-top{padding:16px 18px 12px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.wos-ttl{font-size:1.02rem;font-weight:800;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.wos-svc{margin-top:2px;font-size:.78rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wos-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px 2px}
.wos-tab{position:relative;height:30px;padding:0 13px;border-radius:8px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .76rem/1 inherit;cursor:pointer}
.wos-tab.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.wos-tab-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--dv-gold,#C9A96E);margin-left:6px;vertical-align:middle}
.wos-block{margin:14px 18px 0;border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid var(--wc,var(--dv-gold,#C9A96E));border-radius:10px;overflow:hidden}
.wos-block-hd{display:flex;align-items:center;gap:8px;padding:9px 13px;background:var(--dv-paper,#F4F4F2);border-bottom:1px solid var(--dv-line-soft,#EDEDE9)}
.wos-block-dot{width:9px;height:9px;border-radius:3px;background:var(--wc,var(--dv-gold,#C9A96E));flex-shrink:0}
.wos-block-name{font-size:.84rem;font-weight:700;color:var(--dv-ink,#101418)}
.wos-col{margin-left:auto;font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.wos-rows{background:#fff}
.wos-row{display:grid;grid-template-columns:30px 1fr auto;gap:8px;align-items:center;padding:9px 13px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.wos-item:first-child>.wos-row{border-top:none}
.wos-row.head .wos-name{font-weight:700}
.wos-row.sub{padding-top:5px;padding-bottom:5px;background:var(--dv-raise,#FBFBFA)}
.wos-row.sub .wos-name{font-size:.78rem;color:var(--dv-meta,#787D84);padding-left:4px}
.wos-num{width:22px;height:22px;border-radius:6px;background:var(--wc,var(--dv-gold,#C9A96E));color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700}
.wos-row.sub .wos-num{background:none}
.wos-name{font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418);min-width:0}
.wos-qty{color:var(--dv-meta,#787D84);font-weight:600}
.wos-amt{font-size:.86rem;font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;white-space:nowrap}
.wos-row.sub .wos-amt{font-size:.78rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wos-sub{display:flex;justify-content:space-between;padding:8px 13px;background:var(--dv-raise,#FBFBFA);border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.78rem;font-weight:600;color:var(--dv-ink-soft,#3A4048)}
.wos-sub span:last-child{font-variant-numeric:tabular-nums}
.wos-total{margin:16px 18px 18px;display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:var(--dv-ink,#101418);border-radius:10px;color:#fff;font-size:.92rem;font-weight:700}
.wos-total span:last-child{color:var(--dv-gold,#C9A96E);font-size:1.08rem;font-variant-numeric:tabular-nums}
.wos-note{margin:-8px 18px 16px;font-size:.74rem;color:var(--dv-meta,#787D84);font-style:italic}
`;
