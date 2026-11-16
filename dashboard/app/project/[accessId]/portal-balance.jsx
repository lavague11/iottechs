"use client";
// Balance card + payment ledger + the pop-ups behind them (balance detail, one payment, its proof photo).
// ONE component for the staff Project Hub and the customer portal. Staff pass nothing for `payments` and it
// reads the full ledger itself; the customer portal passes the server-sanitized rows (paymentsSummary — no
// recorder, note, processor ids or photos), so the same markup simply has less to show. Renders nothing
// until there is a contract: never a misleading $0.
import { useEffect, useState } from "react";
import { getPaymentsForLogAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPayDate = (s) => { const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; try { return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return `${m[2]}/${m[3]}/${m[1]}`; } };
const payKindLabel = (k) => ({ deposit: "Deposit", final: "Final payment", partial: "Partial payment", other: "Payment" }[k] || "Payment");

// Ledger source is explicit: `payments` (already server-gated rows) is the default; `staff` alone opts into the
// component reading the ledger itself. There is no implicit fetch, so mounting this in a customer context
// without `payments` shows an empty ledger rather than reaching for rows it was never given.
export default function PortalBalance({ accessId, finance, payments = [], staff = false, onPay = null }) {
  const [balOpen, setBalOpen] = useState(false);      // Project balance detail pop-up
  const [fetched, setFetched] = useState([]);         // staff: ledger read here when none was supplied
  const [payDetail, setPayDetail] = useState(null);   // one payment opened for full detail
  const [lightbox, setLightbox] = useState(null);     // a payment proof photo opened full-size
  useEffect(() => {
    if (!staff || !accessId || !finance?.hasContract) { setFetched([]); return; }
    let live = true;
    getPaymentsForLogAction(accessId).then((r) => { if (live && r?.ok) setFetched(r.payments || []); }).catch(() => {});
    return () => { live = false; };
  }, [staff, accessId, finance?.hasContract]);
  // Confirmed money-in-hand plus any still-pending submissions (tagged), newest first.
  const shownPays = (staff ? fetched : (Array.isArray(payments) ? payments : [])).filter((p) => (+p.amount || 0) > 0 && p.status !== "void");
  if (!finance?.hasContract) return null;
  return (
    <>
      <style>{BAL_CSS}</style>
      <div className="cpv-bal">
        <button type="button" className="cpv-bal-sum" onClick={() => setBalOpen(true)}>
          <div className="cpv-kick">Project balance</div>
          {finance.paidInFull ? (
            <>
              <div className="cpv-paid">Paid in full<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-2px", marginLeft: 4 }}><path d="M20 6 9 17l-5-5"/></svg></div>
              {finance.pendingAddons > 0 && (
                <div className="cpv-balpend"><span>Pending add-on{finance.pendingAddonCount > 1 ? "s" : ""} · awaiting approval</span><b>+{money(finance.pendingAddons)}</b></div>
              )}
            </>
          ) : (
            <div className="cpv-balrows">
              <div><span>Total</span><b>{money(finance.total)}</b></div>
              <div><span>Paid</span><b>{money(finance.paid)}</b></div>
              <div className="cpv-balrem"><span>Remaining</span><b>{money(finance.balance)}{finance.pendingAddons > 0 && <span className="cpv-pendplus"> + {money(finance.pendingAddons)} pending</span>}</b></div>
              {/* Pending add-ons shown but NOT billed until approved. */}
              {finance.pendingAddons > 0 && (
                <div className="cpv-balpend"><span>Pending add-on{finance.pendingAddonCount > 1 ? "s" : ""} · awaiting approval</span><b>+{money(finance.pendingAddons)}</b></div>
              )}
            </div>
          )}
        </button>
        {onPay && <button type="button" className="cpv-cta" onClick={onPay}>Pay</button>}
        {shownPays.length > 0 && (
          <div className="cpv-pays">
            <div className="cpv-pays-h">Payments</div>
            {shownPays.map((p) => (
              <button key={p.id} type="button" className="cpv-pay" onClick={() => setPayDetail(p)}>
                <span className="cpv-pay-date">{fmtPayDate(p.paid_at || p.created_at)}</span>
                <span className="cpv-pay-method">{p.method || payKindLabel(p.kind)}</span>
                {p.status === "pending" && <span className="cpv-pay-tag">Pending</span>}
                {p.photos?.length > 0 && (
                  <span className="cpv-pay-clip" title={`${p.photos.length} photo${p.photos.length > 1 ? "s" : ""}`}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  </span>
                )}
                <span className="cpv-pay-amt">{money(p.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {balOpen && (
        <div className="cpv-balmodal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setBalOpen(false); }}>
          <div className="cpv-balmodal" role="dialog" aria-modal="true" aria-label="Project balance">
            <div className="cpv-balmodal-head">
              <span>Project balance</span>
              <button type="button" onClick={() => setBalOpen(false)} aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            {finance.paidInFull ? (
              <div className="cpv-balmodal-paid">Paid in full<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-2px", marginLeft: 4 }}><path d="M20 6 9 17l-5-5"/></svg></div>
            ) : (
              <>
                <div className="cpv-balmodal-big">{money(finance.balance)}</div>
                <div className="cpv-balmodal-sub">remaining balance</div>
                <div className="cpv-balmodal-rows">
                  <div><span>Total</span><b>{money(finance.total)}</b></div>
                  <div><span>Paid</span><b>{money(finance.paid)}</b></div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT DETAIL — full record for one payment, with any proof photos (Zelle screenshots, check
          front/back). Click a photo to view it full-size. */}
      {payDetail && (
        <div className="cpv-balmodal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setPayDetail(null); }}>
          <div className="cpv-balmodal cpv-paymodal" role="dialog" aria-modal="true" aria-label="Payment detail">
            <div className="cpv-balmodal-head">
              <span>Payment</span>
              <button type="button" onClick={() => setPayDetail(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="cpv-balmodal-big" style={{ color: payDetail.status === "pending" ? "var(--meta)" : "var(--green)" }}>{money(payDetail.amount)}</div>
            <div className="cpv-balmodal-sub">{payKindLabel(payDetail.kind)}{payDetail.status === "pending" ? " · awaiting confirmation" : ""}</div>
            <div className="cpv-balmodal-rows">
              <div><span>Date</span><b>{fmtPayDate(payDetail.paid_at || payDetail.created_at)}</b></div>
              {payDetail.method && <div><span>Method</span><b>{payDetail.method}</b></div>}
              {+payDetail.fee_amount > 0 && <div><span>Processing fee</span><b>{money(payDetail.fee_amount)}</b></div>}
              {payDetail.recorded_by && <div><span>Recorded by</span><b>{payDetail.recorded_by}</b></div>}
              {payDetail.source === "customer" && <div><span>Source</span><b>Customer</b></div>}
            </div>
            {payDetail.note && <div className="cpv-pay-note">{payDetail.note}</div>}
            {payDetail.photos?.length > 0 && (
              <div className="cpv-pay-photos">
                {payDetail.photos.map((src, i) => (
                  <button key={i} type="button" className="cpv-pay-thumb" onClick={() => setLightbox(src)} aria-label="View photo full size">
                    <img src={src} alt={`Payment proof ${i + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {lightbox && (
        <div className="cpv-lightbox" onMouseDown={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Payment photo">
          <img src={lightbox} alt="Payment proof" />
        </div>
      )}

    </>
  );
}

const BAL_CSS = `
/* The card carries its own base styles (it used to lean on the host's stylesheet). Tokens come from the
   surrounding .cpv scope — both hosts render inside it. */
.cpv-bal{background:var(--raise);border:1px solid var(--line);border-radius:16px;padding:16px 20px}
.cpv-bal .cpv-kick{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--meta);margin-bottom:9px}
.cpv-bal .cpv-balrows{display:flex;flex-direction:column;gap:7px}
.cpv-bal .cpv-balrows>div{display:flex;justify-content:space-between;font-size:15px;color:var(--ink-soft)}
.cpv-bal .cpv-balrows b{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:700}
.cpv-bal .cpv-balrem{border-top:1px solid var(--line);padding-top:9px;margin-top:2px;font-weight:700}
.cpv-bal .cpv-balrem span{color:var(--ink)}
.cpv-bal .cpv-balrem b{color:var(--gold-text)}
.cpv-bal .cpv-paid{font-size:1.3rem;font-weight:700;color:var(--green)}
.cpv-bal .cpv-cta{margin-top:16px;display:block;background:var(--gold);color:var(--ink);font-weight:700;font-size:15px;border:0;border-radius:11px;padding:13px 20px;cursor:pointer;width:100%}
.cpv-bal .cpv-cta:hover{background:var(--gold-deep);color:#fff}
/* Balance card: clickable summary (opens the balance pop-up) + the payment ledger beneath it. */
.cpv-bal-sum{display:block;width:100%;text-align:left;font-family:inherit;cursor:pointer;background:none;border:0;padding:0}
.cpv-bal-sum:hover .cpv-balrem b{text-decoration:underline;text-underline-offset:2px}
.cpv-pendplus{color:var(--gold-text);font-weight:600;font-size:12.5px}
.cpv-balpend{display:flex;justify-content:space-between;gap:10px;margin-top:8px;padding:7px 11px;border:1px solid color-mix(in srgb,var(--gold) 38%,transparent);background:color-mix(in srgb,var(--gold) 12%,transparent);border-radius:10px;font-size:13px;color:var(--gold-text);font-weight:600}
.cpv-balpend b{color:var(--gold-text);font-variant-numeric:tabular-nums}
.cpv-pays{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.cpv-pays-h{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--meta);margin-bottom:8px}
.cpv-pay{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--paper);font-family:inherit;cursor:pointer;margin-bottom:7px}
.cpv-pay:last-child{margin-bottom:0}
.cpv-pay:hover{border-color:var(--ink);background:#fff}
.cpv-pay-date{font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap}
.cpv-pay-method{font-size:13px;color:var(--meta);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cpv-pay-tag{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gold-text);background:rgba(201,169,110,.16);border-radius:100px;padding:2px 8px;white-space:nowrap}
.cpv-pay-clip{display:inline-flex;color:var(--faint)}
.cpv-pay-amt{margin-left:auto;font-size:14px;font-weight:700;color:var(--green);font-variant-numeric:tabular-nums;white-space:nowrap}
.cpv-paymodal{max-width:400px}
.cpv-pay-note{margin-top:12px;font-size:13px;color:var(--ink-soft);background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:9px 11px;white-space:pre-wrap}
.cpv-pay-photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.cpv-pay-thumb{width:72px;height:72px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--paper);cursor:pointer;padding:0}
.cpv-pay-thumb:hover{border-color:var(--ink)}
.cpv-pay-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.cpv-lightbox{position:fixed;inset:0;z-index:60;background:rgba(16,20,24,.86);display:flex;align-items:center;justify-content:center;padding:28px;cursor:zoom-out}
.cpv-lightbox img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
.cpv-balmodal-bg{position:fixed;inset:0;z-index:50;background:rgba(16,20,24,.42);display:flex;align-items:center;justify-content:center;padding:20px}
.cpv-balmodal{width:100%;max-width:360px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 48px rgba(16,20,24,.22);padding:18px 20px 22px}
.cpv-balmodal-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--meta);margin-bottom:14px}
.cpv-balmodal-head button{border:0;background:none;font-size:1.4rem;line-height:1;color:var(--meta);cursor:pointer}
.cpv-balmodal-big{font-size:2.2rem;font-weight:800;color:var(--gold-text);font-variant-numeric:tabular-nums}
.cpv-balmodal-sub{font-size:13px;color:var(--meta);margin-top:2px;margin-bottom:14px}
.cpv-balmodal-rows>div{display:flex;justify-content:space-between;font-size:14px;color:var(--ink-soft);padding:5px 0;border-top:1px solid var(--line)}
.cpv-balmodal-rows b{font-variant-numeric:tabular-nums;color:var(--ink)}
.cpv-balmodal-paid{font-size:1.4rem;font-weight:700;color:var(--green)}
`;
