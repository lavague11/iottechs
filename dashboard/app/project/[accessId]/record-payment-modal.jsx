"use client";
// ONE on-demand payment-entry surface for staff. Opened from the proposal action row (and the
// Approval & Deposit tool) instead of a permanently-open inline form, so the project page summarizes
// state and the ledger form appears only when staff actually record a payment.
//
// Self-contained: it pulls the canonical approval data (getApprovalDataAction → published proposal,
// payments, add-ons), derives Total / Balance / Currently-due with the SAME selectors every stage
// shares (optionTotals + projectFinancials + planDepositPct), prefills the amount, and writes through
// the canonical recordPaymentAction. It never recomputes money independently and never touches the
// proposal version — recording a payment is a ledger write, not a proposal revision.
//
// "Currently due" ≠ "can record". The deposit is only *due* once the agreement is SIGNED; before that
// staff may still record an early/manual payment, but the modal says so instead of inventing a due state.
// Desktop = centered modal; phone = bottom sheet (CSS only). Same fields, same action, both.
import { useState, useEffect, useRef, useCallback } from "react";
import { optionTotals, projectFinancials, planDepositPct } from "../../../lib/proposal";
import { getApprovalDataAction, recordPaymentAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => { if (!d) return ""; try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d).slice(0, 10); } };

// Derive the money picture from the canonical approval payload — identical math to the deposit tool.
function deriveFinancials(data, isFinal) {
  const pp = data?.proposal;
  if (!pp?.payload?.options?.length) return null;
  const ids = (pp.accepted_options?.length) ? pp.accepted_options : (pp.selected_option ? [pp.selected_option] : []);
  const opts = pp.payload.options.filter((o) => ids.includes(o.id));
  const shown = opts.length ? opts : [pp.payload.options[0]];
  const grand = shown.reduce((s, o) => s + optionTotals(o, pp.tax_rate, pp.payload.discount, pp.deposit_pct, pp.payload.pcp_credit).grand, 0);
  const addonsTotal = +data.addons?.total || 0;
  const confirmed = (data.payments || []).filter((x) => x.status !== "pending");
  const paid = confirmed.reduce((s, x) => s + (+x.amount || 0), 0);
  const depositPaid = confirmed.filter((x) => x.kind === "deposit").reduce((s, x) => s + (+x.amount || 0), 0);
  const depositPct = planDepositPct(pp.payload, pp.deposit_pct);
  const fin = projectFinancials(grand, addonsTotal, paid, depositPct);
  const depositDue = Math.max(0, fin.depositTarget - depositPaid);
  const signed = !!pp.signed_name;
  // The deposit is contractually DUE only once the agreement is signed. Final balance is due at completion.
  const currentlyDue = isFinal ? fin.balance : (signed ? depositDue : 0);
  // What to prefill: the due amount if there is one, else the natural target (deposit, or balance).
  const prefill = currentlyDue > 0 ? currentlyDue : (isFinal ? fin.balance : (depositDue > 0 ? depositDue : fin.balance));
  return {
    total: fin.current, balance: fin.balance, depositPct, depositTarget: fin.depositTarget,
    depositDue, paid, signed, currentlyDue, prefill,
    kind: isFinal ? "final" : "deposit",
  };
}

export default function RecordPaymentModal({ accessId, open, onClose, onRecorded, stage = "approval_deposit", showToast }) {
  const isFinal = stage === "payment";
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(null);
  const [fin, setFin] = useState(null);
  const [pay, setPay] = useState({ amount: "", method: "Zelle", kind: isFinal ? "final" : "deposit", note: "", paidAt: today });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [histOpen, setHistOpen] = useState(false);
  const panelRef = useRef(null);
  const amountRef = useRef(null);

  // Pull canonical data each time the modal opens, then prefill the amount from what's owed.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setData(null); setFin(null); setErr(null);
    getApprovalDataAction(accessId).then((r) => {
      if (!live || !r?.ok) return;
      setData(r);
      const f = deriveFinancials(r, isFinal);
      setFin(f);
      setPay((v) => ({ ...v, amount: f && f.prefill > 0 ? f.prefill.toFixed(2) : "", kind: f?.kind || v.kind, paidAt: today }));
    }).catch(() => { if (live) setErr("Couldn't load the balance. Try again."); });
    return () => { live = false; };
  }, [open, accessId, isFinal]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the amount once loaded.
  useEffect(() => { if (open && fin) { const id = setTimeout(() => amountRef.current?.focus(), 40); return () => clearTimeout(id); } }, [open, fin]);

  const close = useCallback(() => { if (!busy) onClose?.(); }, [busy, onClose]);

  // Escape to close; trap Tab inside the panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!nodes || !nodes.length) return;
      const list = [...nodes].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  async function submit() {
    if (busy || !(+pay.amount > 0)) return;
    setBusy(true); setErr(null);
    const r = await recordPaymentAction(accessId, pay);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }          // keep open, preserve values, no optimistic change
    const verb = `${money(pay.amount)} via ${pay.method}`;
    showToast?.(`Payment recorded · ${verb}`);
    onRecorded?.(r);                                      // parent refreshes canonical state / status
    onClose?.();
  }

  const payments = data?.payments || [];
  const dueNote = fin && !isFinal && fin.currentlyDue <= 0 && fin.depositTarget > 0
    ? `Deposit isn't due until the agreement is signed — this records an early payment.`
    : null;

  return (
    <div className="rpm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <style>{RPM_CSS}</style>
      <div className="rpm-panel" role="dialog" aria-modal="true" aria-label="Record payment" ref={panelRef}>
        <div className="rpm-head">
          <span className="rpm-title">Record Payment</span>
          <button type="button" className="rpm-x" onClick={close} aria-label="Close" disabled={busy}>×</button>
        </div>

        {!fin ? (
          <div className="rpm-loading">{err || "Loading balance…"}</div>
        ) : (<>
          {/* Quiet money context — two rows, not three dashboard cards. */}
          <div className="rpm-ctx">
            <div className="rpm-ctx-row"><span>Balance</span><b>{money(fin.balance)}</b></div>
            {fin.currentlyDue > 0 && (
              <div className="rpm-ctx-row"><span>{isFinal ? "Final payment due" : "Deposit due"}</span><b className="rpm-due">{money(fin.currentlyDue)}</b></div>
            )}
          </div>
          {dueNote && <div className="rpm-note-manual">{dueNote}</div>}

          {err && <div className="rpm-err">{err}</div>}

          <div className="rpm-grid">
            <label className="rpm-fld"><span>Amount</span>
              <input ref={amountRef} className="rpm-input num" type="number" min="0" step="0.01" placeholder="0.00"
                value={pay.amount} onChange={(e) => setPay((v) => ({ ...v, amount: e.target.value }))} /></label>
            <label className="rpm-fld"><span>Method</span>
              <select className="rpm-input" value={pay.method} onChange={(e) => setPay((v) => ({ ...v, method: e.target.value }))}>
                <option>Zelle</option><option>Certified Check</option><option>Cash</option><option>Card</option><option>Wire</option><option>Other</option>
              </select></label>
            <label className="rpm-fld"><span>Date paid</span>
              <input className="rpm-input" type="date" max={today} value={pay.paidAt} onChange={(e) => setPay((v) => ({ ...v, paidAt: e.target.value }))} /></label>
            <label className="rpm-fld"><span>Reference <em>(optional)</em></span>
              <input className="rpm-input" placeholder="Reference #…" value={pay.note} onChange={(e) => setPay((v) => ({ ...v, note: e.target.value }))} /></label>
          </div>

          {payments.length > 0 && (
            <div className="rpm-hist">
              <button type="button" className="rpm-hist-tog" onClick={() => setHistOpen((o) => !o)} aria-expanded={histOpen}>
                View payments ({payments.length})
                <svg className={histOpen ? "open" : ""} viewBox="0 0 10 6" width="10" height="6" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>
              </button>
              {histOpen && (
                <div className="rpm-hist-list">
                  {payments.map((x) => (
                    <div key={x.id} className="rpm-hrow">
                      <span className="rpm-hrow-amt">{money(x.amount)}</span>
                      <span className="rpm-hrow-meta">{[x.kind, x.method, (x.paid_at || x.created_at) && fmtDay(x.paid_at || x.created_at)].filter(Boolean).join(" · ")}</span>
                      <span className={`rpm-hrow-st ${x.status === "pending" ? "pend" : "ok"}`}>{x.status === "pending" ? "Pending" : "Received"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rpm-acts">
            <button type="button" className="rpm-btn ghost" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className="rpm-btn gold" onClick={submit} disabled={busy || !(+pay.amount > 0)}>Record Payment</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

const RPM_CSS = `
.rpm-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(16,20,24,.42);padding:20px;font-family:var(--font-sans),inherit}
.rpm-panel{width:100%;max-width:440px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 18px 48px rgba(16,20,24,.22);padding:18px 18px 16px;max-height:92vh;overflow:auto}
.rpm-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.rpm-title{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.rpm-x{margin-left:auto;width:30px;height:30px;border:none;background:none;color:var(--dv-meta,#787D84);font-size:1.4rem;line-height:1;cursor:pointer;border-radius:8px}
.rpm-x:hover:not(:disabled){background:rgba(16,20,24,.05);color:var(--dv-ink,#101418)}
.rpm-loading{padding:26px 6px;text-align:center;color:var(--dv-meta,#787D84);font-size:.85rem}
.rpm-ctx{display:flex;flex-direction:column;gap:5px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:10px 13px;margin-bottom:10px}
.rpm-ctx-row{display:flex;justify-content:space-between;align-items:baseline;font-size:.82rem}
.rpm-ctx-row span{color:var(--dv-meta,#787D84);font-weight:500}
.rpm-ctx-row b{color:var(--dv-ink,#101418);font-weight:700}
.rpm-ctx-row b.rpm-due{color:var(--dv-red,#C4553D)}
.rpm-note-manual{font-size:.75rem;color:var(--dv-gold-text,#8A6A1F);background:rgba(201,169,110,.1);border:1px solid rgba(201,169,110,.26);border-radius:8px;padding:7px 11px;margin-bottom:10px;line-height:1.4}
.rpm-err{font-size:.8rem;font-weight:600;color:var(--dv-red,#C4553D);background:#fbe9e6;border:1px solid #e3b4ab;border-radius:8px;padding:8px 11px;margin-bottom:10px}
.rpm-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.rpm-fld{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--dv-meta,#787D84)}
.rpm-fld em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0;color:var(--dv-faint,#A1A6AC)}
.rpm-input{width:100%;min-width:0;box-sizing:border-box;height:40px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;padding:0 11px;font-size:.9rem;font-weight:500;color:var(--dv-ink,#101418);font-family:inherit;outline:none;text-transform:none;letter-spacing:0}
.rpm-input.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.rpm-input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.rpm-hist{margin-top:12px;border-top:1px solid var(--dv-line,#E4E4DF);padding-top:10px}
.rpm-hist-tog{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--dv-meta,#787D84);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;padding:0}
.rpm-hist-tog:hover{color:var(--dv-gold-text,#8A6A1F)}
.rpm-hist-tog svg{transition:transform .14s}.rpm-hist-tog svg.open{transform:rotate(180deg)}
.rpm-hist-list{display:flex;flex-direction:column;gap:4px;margin-top:9px}
.rpm-hrow{display:flex;align-items:baseline;gap:8px;font-size:.8rem}
.rpm-hrow-amt{font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.rpm-hrow-meta{color:var(--dv-meta,#787D84);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:capitalize}
.rpm-hrow-st{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.rpm-hrow-st.ok{color:var(--dv-green,#2E7D5B)}.rpm-hrow-st.pend{color:var(--dv-gold-text,#8A6A1F)}
.rpm-acts{display:flex;gap:10px;margin-top:16px}
.rpm-btn{height:42px;border-radius:10px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid transparent}
.rpm-btn.ghost{flex:0 0 auto;padding:0 18px;background:none;border-color:var(--dv-line,#E4E4DF);color:var(--dv-meta,#787D84)}
.rpm-btn.ghost:hover:not(:disabled){border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-ink,#101418)}
.rpm-btn.gold{flex:1 1 auto;background:#C9A96E;color:#101418}
.rpm-btn.gold:hover:not(:disabled){filter:brightness(1.06)}
.rpm-btn:disabled{opacity:.5;cursor:default}
@media(max-width:640px){
  .rpm-overlay{align-items:flex-end;padding:0}
  .rpm-panel{max-width:100%;border-radius:16px 16px 0 0;max-height:90vh;padding-bottom:calc(16px + env(safe-area-inset-bottom,0))}
  .rpm-grid{grid-template-columns:1fr}
}
`;
