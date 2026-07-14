"use client";
import { useState, useEffect, useRef } from "react";
import { optionTotals, fmtSignStamp } from "../../../lib/proposal";
import { getApprovalDataAction, signProposalAction, recordPaymentAction, deletePaymentAction, confirmPaymentAction, createWorkOrderAction, voidProposalSignatureAction } from "./proposal-actions";
import ProposalSignModal from "./proposal-sign-modal";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Status tool-head — matches the page's other tool cards (icon + title + Complete / pending chip)
// instead of the old dark document sub-headers. Sits directly on top of an .apv-card so header +
// body read as one contained tool, like Survey / Mockup / QC elsewhere on the page.
const APV_ICON = {
  pen:  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
  card: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  clip: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg>,
};
function ToolHead({ icon, title, done, doneLabel, pendingLabel }) {
  return (
    <div className="apv-toolhead">
      <span className={`apv-th-ic${done ? " done" : ""}`}>
        {done
          ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : APV_ICON[icon]}
      </span>
      <span className="apv-th-title">{title}</span>
      <span className={`apv-th-status ${done ? "done" : "pending"}`}>{done ? doneLabel : pendingLabel}</span>
    </div>
  );
}

// Approval & Deposit stage — one pipeline, in order:
//   ① Proposal accepted → ② Agreement signed → ③ Deposit received → ④ Work order created.
// The step trail up top shows exactly where things stand; each section below completes one step.
// Customer signs (same signature tool as accepting) and acknowledges payments; staff record
// actual received payments and create the work order once it's signed AND a deposit is on file.
export default function ApprovalPanel({ accessId, role, customerName, customerAddress, onStageChange, onBrowseStage, stage = "approval_deposit" }) {
  const isStaff = ["admin", "manager"].includes(role);
  const isCustomer = role === "customer";
  // Two portals share this component: the Deposit portal (approval stage) and the Final Payment
  // portal (payment stage). Final skips the signature/work-order pipeline — those are already done —
  // and focuses on the remaining balance.
  const isFinal = stage === "payment";
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (m) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };
  const [signOpen, setSignOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "Zelle", kind: isFinal ? "final" : "deposit", note: "" });
  const [woCreated, setWoCreated] = useState(false);
  const [delPayId, setDelPayId] = useState(null);   // payment pending delete-confirm
  const [voidSigOpen, setVoidSigOpen] = useState(false);

  useEffect(() => {
    let live = true;
    getApprovalDataAction(accessId).then((r) => { if (live && r?.ok) setData(r); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  // Prefill the payment amount with what's still owed (deposit due, or the remaining balance),
  // once the data loads — staff/customer usually pay exactly that. Still fully editable.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !data?.proposal) return;
    const pp = data.proposal;
    if (!(pp.payload && pp.status === "accepted")) return;
    const ids = (pp.accepted_options?.length) ? pp.accepted_options : (pp.selected_option ? [pp.selected_option] : []);
    const opts = pp.payload.options.filter((o) => ids.includes(o.id));
    const sh = opts.length ? opts : [pp.payload.options[0]];
    const grand = sh.reduce((s, o) => s + optionTotals(o, pp.tax_rate, pp.payload.discount, pp.deposit_pct, pp.payload.pcp_credit).grand, 0);
    const conf = (data.payments || []).filter((x) => x.status !== "pending");
    const paid = conf.reduce((s, x) => s + (+x.amount || 0), 0);
    const depPaid = conf.filter((x) => x.kind === "deposit").reduce((s, x) => s + (+x.amount || 0), 0);
    const depDue = Math.max(0, grand * (+pp.deposit_pct || 50) / 100 - depPaid);
    const bal = Math.max(0, grand + (+data.addons?.total || 0) - paid);
    const due = isFinal ? bal : (depDue > 0 ? depDue : bal);
    prefilled.current = true;
    if (due > 0) setPay((v) => ({ ...v, amount: due.toFixed(2), kind: isFinal ? "final" : (depDue > 0 ? "deposit" : "final") }));
  }, [data, isFinal]);

  if (!data) {
    return <div className="apv-root"><style>{APV_CSS}</style><div className="apv-empty">Loading approval…</div></div>;
  }
  const p = data.proposal;
  const accepted = p && p.payload && p.status === "accepted";
  if (!accepted) {
    // Same gate, different truth depending on who's looking and what the proposal is actually
    // waiting on — staff need to know if THEY still owe an action (build/send/revise) or if the
    // ball's in the customer's court; the customer only ever sees their own next move.
    const status = p?.status;
    const { sub, showBtn } = (() => {
      if (isStaff) {
        if (!status || status === "draft") return { sub: "Build and send the proposal to get started.", showBtn: true };
        if (status === "changes_requested") return { sub: "The customer requested changes — revise the proposal.", showBtn: true };
        if (status === "declined") return { sub: "The customer declined this proposal — revise it to continue.", showBtn: true };
        return { sub: "Sent — waiting on the customer to accept a proposal option.", showBtn: true };   // "sent"
      }
      if (!status || status === "draft") return { sub: "Your proposal isn't ready yet — we'll notify you the moment it's sent.", showBtn: false };
      if (status === "changes_requested") return { sub: "We're revising your proposal based on your requested changes.", showBtn: false };
      if (status === "declined") return { sub: "You declined this proposal. Contact us if you'd like to revisit it.", showBtn: false };
      return { sub: "Accept a proposal option to continue — the agreement, signature, and deposit unlock here once it's accepted.", showBtn: true };   // "sent"
    })();
    return (
      <div className="apv-gate">
        <style>{APV_CSS}</style>
        <div className="apv-gate-ic">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div className="apv-gate-body">
          <div className="apv-gate-title">{isFinal ? "Final Payment" : "Approval & Deposit"}</div>
          <div className="apv-gate-sub">{sub}</div>
          {onBrowseStage && showBtn && (
            <button type="button" className="apv-gate-btn" onClick={() => onBrowseStage("proposal")}>Go to Proposal</button>
          )}
        </div>
      </div>
    );
  }

  // The customer may have accepted more than one option — combine their totals.
  const acceptedIds = (p.accepted_options && p.accepted_options.length) ? p.accepted_options : (p.selected_option ? [p.selected_option] : []);
  const acceptedOpts = p.payload.options.filter((o) => acceptedIds.includes(o.id));
  const shown = acceptedOpts.length ? acceptedOpts : [p.payload.options[0]];
  const t = shown.reduce((acc, o) => {
    const tt = optionTotals(o, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);
    return { sub: acc.sub + tt.sub, grand: acc.grand + tt.grand };
  }, { sub: 0, grand: 0 });
  const optLabel = shown.map((o) => `Option ${o.id} (${o.name})`).join(" + ");
  const depositPct = +p.deposit_pct || 50;
  const payments = data.payments || [];
  const depositTarget = t.grand * depositPct / 100;
  // Only CONFIRMED money counts — a customer submission sits pending until staff confirm receipt.
  const confirmed = payments.filter((x) => x.status !== "pending");
  const pendingTotal = payments.filter((x) => x.status === "pending").reduce((s, x) => s + (+x.amount || 0), 0);
  const depositPaid = confirmed.filter((x) => x.kind === "deposit").reduce((s, x) => s + (+x.amount || 0), 0);
  const paidTotal = confirmed.reduce((s, x) => s + (+x.amount || 0), 0);
  const depositDue = Math.max(0, depositTarget - depositPaid);
  // Approved job-site add-ons add to what's owed (deposit stays based on the original proposal).
  const addons = data.addons || { total: 0, list: [] };
  const grandWithAddons = t.grand + (+addons.total || 0);
  const balance = Math.max(0, grandWithAddons - paidTotal);
  const signed = !!p.signed_name;
  const depositOk = depositPaid > 0;
  const propNum = "PROP-" + String(p.id || "0").padStart(4, "0") + "-v" + (p.version || 1);

  // If the server auto-advanced past approval (everything done), follow it.
  const followStage = (s) => { if (s && s !== "approval_deposit") { showToast("All set — moving to the next step"); onStageChange?.(s); } };
  async function sign({ name, data: sigData }) {
    setBusy(true); setErr(null);
    const r = await signProposalAction(accessId, name, sigData);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setData((d) => ({ ...d, proposal: r.proposal }));
    setSignOpen(false);
    showToast("Agreement signed");
    followStage(r.stage);
  }
  async function addPayment() {
    if (busy || !(+pay.amount > 0)) return;
    setBusy(true); setErr(null);
    const r = await recordPaymentAction(accessId, pay);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setData((d) => ({ ...d, payments: r.payments }));
    setPay({ amount: "", method: pay.method, kind: isFinal ? "final" : "deposit", note: "" });
    showToast(isCustomer ? "Payment submitted — here's what happens next" : "Payment recorded");
    followStage(r.stage);
    // On the deposit portal, a customer's natural next step after paying is scheduling — take them
    // there (view only; the stage moves when staff confirm). The final portal just stays put.
    if (isCustomer && !isFinal) setTimeout(() => onBrowseStage?.("schedule"), 900);
  }
  async function delPayment(id) {
    setBusy(true); setErr(null);
    const r = await deletePaymentAction(accessId, id);
    setBusy(false);
    setDelPayId(null);
    if (r?.error) { setErr(r.error); return; }
    setData((d) => ({ ...d, payments: r.payments }));
    showToast(isCustomer ? "Payment request cancelled" : "Payment removed — archived");
  }
  async function voidSignature() {
    setBusy(true); setErr(null);
    const r = await voidProposalSignatureAction(accessId);
    setBusy(false);
    setVoidSigOpen(false);
    if (r?.error) { setErr(r.error); return; }
    setData((d) => ({ ...d, proposal: r.proposal }));
    showToast("Signature voided — customer can re-sign");
  }
  async function confirmPayment(id) {
    setBusy(true); setErr(null);
    const r = await confirmPaymentAction(accessId, id);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setData((d) => ({ ...d, payments: r.payments }));
    showToast("Payment confirmed — balance updated");
    followStage(r.stage);
  }
  async function createWO() {
    setBusy(true); setErr(null);
    const r = await createWorkOrderAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setWoCreated(true);
    showToast("Work order created — moving to Fulfillment");
    onStageChange?.(r.stage);
  }

  return (
    <div className="apv-root">
      <style>{APV_CSS}</style>

      <div className="apv-titlebar">
        <span className="apv-titlebar-h">{isFinal ? "Final Payment" : (isCustomer ? "Make Your Deposit" : "Approval & Deposit")}</span>
      </div>

      {err && <div className="apv-note err">{err}</div>}

      {/* Compact recap + the money picture in one box. Customers get the focused payment tool
          instead (the balance banner below already shows total/received/due), so skip the recap. */}
      {!isCustomer && (
      <div className="apv-summary">
        <div className="apv-sum-row"><span className="apv-sum-lbl">Prepared For</span><b>{customerName || "Client"}</b></div>
        <div className="apv-sum-row"><span className="apv-sum-lbl">Accepted {shown.length > 1 ? "Options" : "Option"}</span><b>{optLabel}</b></div>
        {customerAddress && <div className="apv-sum-row"><span className="apv-sum-lbl">Job Site</span><b>{customerAddress}</b></div>}
        <div className="apv-sum-divider" />
        <div className="apv-sum-row"><span className="apv-sum-lbl">Proposal Total</span><b className="apv-total">{money(t.grand)}</b></div>
        {addons.list.map((a) => (
          <div key={a.id} className="apv-sum-row apv-sum-addon"><span className="apv-sum-lbl">Add-on · {a.title}</span><b>{money(a.total)}</b></div>
        ))}
        {addons.total > 0 && <div className="apv-sum-row"><span className="apv-sum-lbl">Total With Add-ons</span><b className="apv-total">{money(grandWithAddons)}</b></div>}
        <div className="apv-sum-row"><span className="apv-sum-lbl">Deposit ({depositPct}%)</span><b>{money(depositTarget)}</b></div>
        <div className="apv-sum-row"><span className="apv-sum-lbl">Received So Far</span><b className={paidTotal > 0 ? "apv-ok" : ""}>{money(paidTotal)}</b></div>
        {depositDue > 0 && <div className="apv-sum-row"><span className="apv-sum-lbl">Deposit Still Due</span><b className="apv-due">{money(depositDue)}</b></div>}
        <div className="apv-sum-divider" />
        <div className="apv-sum-row"><span className="apv-sum-lbl">Remaining Balance</span><b className={balance > 0 ? "apv-due" : "apv-ok"}>{money(balance)}</b></div>
        <div className="apv-sum-note">Zelle preferred. Balance due upon completion. Proposal terms apply.</div>
      </div>
      )}

      {/* ② Signature — staff only. The customer already signed when they accepted the proposal
          (Accept & Sign), so their view skips straight to the payment tool. */}
      {!isFinal && !isCustomer && (<>
      <ToolHead icon="pen" title="Signature" done={signed} doneLabel="Signed" pendingLabel="Awaiting signature" />
      <div className="apv-card">
        {signed ? (
          <div className="apv-signed">
            {p.signature_data
              ? <img src={p.signature_data} alt="Signature" className="apv-sig-img" />
              : <span className="apv-sig-name">{p.signed_name}</span>}
            <span className="apv-sig-meta">{p.signed_name} · Signed {fmtSignStamp(p.signed_at)}</span>
            {isStaff && (voidSigOpen ? (
              <span className="apv-void-confirm">
                Void this signature?
                <button className="apv-void-yes" disabled={busy} onClick={voidSignature}>Void</button>
                <button className="apv-void-no" onClick={() => setVoidSigOpen(false)}>Keep</button>
              </span>
            ) : (
              <button className="apv-void-btn" title="Void signature (correction)" onClick={() => setVoidSigOpen(true)}>Void</button>
            ))}
          </div>
        ) : isCustomer ? (
          <div className="apv-sign-form">
            <p>Sign to authorize this agreement — same signature tool you used to accept.</p>
            <button className="apv-btn gold" disabled={busy} onClick={() => setSignOpen(true)}>Sign Agreement</button>
          </div>
        ) : (
          <div className="apv-await">Awaiting customer signature.</div>
        )}
      </div>
      </>)}

      {/* ③ Payments — deposit on the approval portal, remaining balance on the final portal */}
      <ToolHead icon="card" title={isFinal ? "Final Payment" : "Deposit & Payments"}
        done={isFinal ? balance <= 0 : depositOk}
        doneLabel={isFinal ? "Paid in full" : "Deposit received"}
        pendingLabel={isFinal ? "Awaiting payment" : "Awaiting deposit"} />
      <div className="apv-card apv-pay-card">
        {/* Balance banner — the one number that matters, with the money picture beside it */}
        {(() => {
          const dueLabel = isFinal ? "Balance due" : (depositDue > 0 ? "Deposit due" : "Balance due");
          const dueAmt   = isFinal ? balance : (depositDue > 0 ? depositDue : balance);
          return (
            <div className={`apv-bal${dueAmt <= 0 ? " paid" : ""}`}>
              <div className="apv-bal-main">
                <span className="apv-bal-lbl">{dueAmt <= 0 ? "Paid in full" : dueLabel}</span>
                <span className="apv-bal-amt">{money(Math.max(0, dueAmt))}</span>
              </div>
              <div className="apv-bal-side">
                <span>Total <b>{money(grandWithAddons)}</b></span>
                <span className="apv-ok">Received <b>{money(paidTotal)}</b></span>
                {pendingTotal > 0 && <span className="apv-pend">Pending <b>{money(pendingTotal)}</b></span>}
              </div>
            </div>
          );
        })()}

        {/* History */}
        {payments.length > 0 ? (
          <div className="apv-hist">
            <div className="apv-hist-hd">Payment history</div>
            {payments.map((x) => (
              <div key={x.id} className={`apv-hrow${x.status === "pending" ? " pending" : ""}`}>
                <div className="apv-hrow-main">
                  <span className="apv-hrow-amt">{money(x.amount)}</span>
                  <span className="apv-hrow-meta">
                    <span className={`apv-pay-src ${x.source}`}>{x.source === "customer" ? "Customer" : "Staff"}</span>
                    <span className="apv-hrow-kind">{x.kind}{x.method ? ` · ${x.method}` : ""}</span>
                    {x.note ? <span className="apv-hrow-note">{x.note}</span> : null}
                    {x.created_at && <span className="apv-hrow-when">{String(x.created_at).slice(0, 10)}</span>}
                  </span>
                </div>
                <div className="apv-hrow-acts">
                  {x.status === "pending"
                    ? <span className="apv-pay-pending">Pending</span>
                    : <span className="apv-hrow-ok">✓ Received</span>}
                  {isStaff && x.status === "pending" && delPayId !== x.id && (
                    <button className="apv-pay-ok" title="Confirm received" disabled={busy} onClick={() => confirmPayment(x.id)}>Confirm</button>
                  )}
                  {/* A customer can cancel their OWN still-pending submission (server re-checks). */}
                  {isCustomer && x.source === "customer" && x.status === "pending" && (
                    delPayId === x.id ? (
                      <span className="apv-pay-confirm">
                        <button className="apv-pay-yes" disabled={busy} onClick={() => delPayment(x.id)}>Cancel it</button>
                        <button className="apv-pay-no" onClick={() => setDelPayId(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="apv-pay-x" title="Cancel this pending payment" onClick={() => setDelPayId(x.id)}>Cancel</button>
                    )
                  )}
                  {isStaff && (delPayId === x.id ? (
                    <span className="apv-pay-confirm">
                      <button className="apv-pay-yes" disabled={busy} onClick={() => delPayment(x.id)}>Remove</button>
                      <button className="apv-pay-no" onClick={() => setDelPayId(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="apv-pay-x" title="Remove" onClick={() => setDelPayId(x.id)}>✕</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="apv-await">No payments recorded yet.</div>
        )}

        {/* Record a payment — a clean, labeled form (no more cramped single row) */}
        {(isCustomer ? balance > 0 : true) && (
        <div className="apv-payform">
          <div className="apv-payform-hd">{isCustomer ? "Make a payment" : "Record a payment"}</div>
          <div className="apv-payform-grid">
            <label className="apv-fld">
              <span>Amount</span>
              <input className="apv-input num" type="number" min="0" step="0.01" placeholder="0.00"
                     value={pay.amount} onChange={(e) => setPay((v) => ({ ...v, amount: e.target.value }))} />
            </label>
            <label className="apv-fld">
              <span>Method</span>
              <select className="apv-input" value={pay.method} onChange={(e) => setPay((v) => ({ ...v, method: e.target.value }))}>
                <option>Zelle</option><option>Certified Check</option><option>Cash</option><option>Card</option><option>Wire</option><option>Other</option>
              </select>
            </label>
            <label className="apv-fld apv-fld-wide">
              <span>Note / reference <em>(optional)</em></span>
              <input className="apv-input" placeholder="Reference #, confirmation…" value={pay.note} onChange={(e) => setPay((v) => ({ ...v, note: e.target.value }))} />
            </label>
          </div>
          {(() => {
            const quick = isFinal ? balance : (depositDue > 0 ? depositDue : balance);
            const qLbl  = isFinal ? "Pay full balance" : (depositDue > 0 ? "Use deposit" : "Pay full balance");
            return quick > 0 && !(+pay.amount) ? (
              <button type="button" className="apv-chip-btn" onClick={() => setPay((v) => ({ ...v, amount: quick.toFixed(2), kind: isFinal ? "final" : (depositDue > 0 ? "deposit" : "final") }))}>
                {qLbl} · {money(quick)}
              </button>
            ) : null;
          })()}
          <button className="apv-btn gold apv-payform-btn" disabled={busy || !(+pay.amount > 0)} onClick={addPayment}>
            {isCustomer ? "I Paid This" : "Record Payment"}
          </button>
        </div>
        )}
        {isCustomer && <div className="apv-fine">Your submission shows as pending until our team confirms receipt — the balance updates once confirmed.</div>}
      </div>

      {/* ④ Staff: create the work order once signed + deposit on file (deposit portal only) */}
      {isStaff && !isFinal && (
        <>
          <ToolHead icon="clip" title="Work Order"
            done={woCreated || !!p.tech_signed_name}
            doneLabel={p.tech_signed_name ? "Accepted" : "Created"}
            pendingLabel="Not yet created" />
          <div className="apv-card apv-wo">
            <div>
              <b>Create the work order</b>
              <p>
                {woCreated || p.tech_signed_name
                  ? (p.tech_signed_name ? `Work order accepted by ${p.tech_signed_name}.` : "Work order created — project is in scheduling.")
                  : signed && depositOk
                    ? "Signed and deposit on file — create the work order to move to scheduling."
                    : [!signed && "customer signature", !depositOk && "a deposit"].filter(Boolean).join(" and ").replace(/^./, (c) => "Needs " + c) + " before the work order can go out."}
              </p>
            </div>
            {!(woCreated || p.tech_signed_name) && (
              <button className="apv-btn green" disabled={busy || !signed || !depositOk} onClick={createWO}>Create Work Order →</button>
            )}
          </div>
        </>
      )}

      <ProposalSignModal
        open={signOpen}
        heading="Sign Agreement"
        subheading={optLabel}
        reference={propNum}
        defaultName={p.signed_name || customerName || ""}
        agreeText="I agree to the accepted proposal's scope, terms, and pricing, and I authorize the project to proceed."
        accent="#C9A96E"
        busy={busy}
        onConfirm={sign}
        onCancel={() => setSignOpen(false)}
      />

      {toast && (
        <div className="apv-toast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
    </div>
  );
}

const APV_CSS = `
.apv-root{background:#FAF8F4;border-radius:14px;border:1px solid #d9d4ca;border-top:4px solid #C9A96E;overflow:hidden;margin:18px 0;padding-bottom:16px;
  box-shadow:0 10px 30px rgba(11,15,26,.08);font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.apv-titlebar{padding:15px 22px 0}
.apv-titlebar-h{font-size:1.05rem;font-weight:800;color:#0B0F1A;letter-spacing:-.01em}
/* Status tool-head — icon + title + Complete/pending chip, stacked directly on its .apv-card */
.apv-toolhead{display:flex;align-items:center;gap:10px;margin:16px 22px 0;background:#fff;border:1px solid #d9d4ca;border-bottom:none;border-radius:10px 10px 0 0;padding:11px 14px}
.apv-th-ic{width:28px;height:28px;flex-shrink:0;border-radius:8px;background:#f0f2f7;color:#5b6275;display:grid;place-items:center}
.apv-th-ic.done{background:#e7f6ec;color:#1c8a45}
.apv-th-title{font-size:.92rem;font-weight:800;color:#0B0F1A}
.apv-th-status{margin-left:auto;font-size:.66rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:4px 11px;border-radius:100px;white-space:nowrap}
.apv-th-status.done{background:#e7f6ec;color:#1c8a45}
.apv-th-status.pending{background:#f7f0df;color:#7a5f1f}
.apv-empty{padding:34px 22px;text-align:center;color:#6f7686;font-size:.86rem}
.apv-gate{display:flex;gap:14px;background:#fff;border:1px solid #e5d3a1;border-left:4px solid #C9A96E;border-radius:12px;padding:18px 20px;margin:18px 0}
.apv-gate-ic{width:40px;height:40px;flex-shrink:0;border-radius:10px;background:#faf4e8;color:#a3812f;display:grid;place-items:center}
.apv-gate-title{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9a8a5f}
.apv-gate-sub{font-size:.83rem;color:#6f7686;line-height:1.45;max-width:520px;margin-top:6px}
.apv-gate-btn{margin-top:12px;height:38px;padding:0 20px;border:none;border-radius:9px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit}
.apv-gate-btn:hover{filter:brightness(1.04)}
.apv-note{margin:14px 22px 0;padding:9px 12px;border-radius:8px;font-size:.8rem;font-weight:600}
.apv-note.err{background:#FBE6E4;border:1px solid #e0b0a8;color:#a8442f}

.apv-summary{margin:14px 22px 0;background:#fff;border:1px solid #d9d4ca;border-top:2px solid #C9A96E;border-radius:4px;padding:14px 16px;display:flex;flex-direction:column;gap:7px}
.apv-sum-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:.84rem}
.apv-sum-lbl{color:#6f7686;font-weight:600}
.apv-sum-addon .apv-sum-lbl{color:#7c3aed}
.apv-sum-addon b{color:#7c3aed}
.apv-sum-row b{color:#0B0F1A;font-weight:700;text-align:right}
.apv-sum-divider{height:1px;background:#ece8e0;margin:4px 0}
.apv-sum-note{font-size:.7rem;color:#6f7686;font-style:italic;margin-top:2px}
.apv-total{font-size:1rem}
.apv-ok{color:#1d7a3a}
.apv-due{color:#a8442f}
.apv-fine{margin:0;font-size:.7rem;color:#6f7686;font-style:italic}

.apv-card{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;border-radius:0 0 10px 10px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.apv-card p{margin:0;font-size:.8rem;color:#4a5270}
.apv-await{font-size:.82rem;color:#6f7686}
.apv-signed{display:flex;flex-direction:column;gap:4px}
.apv-sig-img{max-height:56px;max-width:250px;object-fit:contain;align-self:flex-start}
.apv-sig-name{font-family:"Segoe Script","Brush Script MT",cursive;font-size:1.6rem;color:#0B0F1A;line-height:1.1}
.apv-sig-meta{font-size:.72rem;color:#6f7686}
.apv-sign-form{display:flex;flex-direction:column;gap:10px;align-items:flex-start}

.apv-input{height:38px;border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#0B0F1A;padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.apv-input:focus{border-color:#C9A96E}
.apv-input.num{text-align:right}
select.apv-input{cursor:pointer}
.apv-btn{height:38px;padding:0 18px;border:none;border-radius:9px;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.apv-btn.gold{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A}
.apv-btn.green{background:#2f7d5a;color:#fff}
.apv-btn:hover{filter:brightness(1.05)}
.apv-btn:disabled{opacity:.5;cursor:default}
.apv-chip-btn{height:30px;padding:0 12px;border-radius:100px;border:1px dashed #C9A96E;background:#fff8ee;color:#8a6d2f;
  font-size:.72rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.apv-chip-btn:hover{background:#F3E9D3}

.apv-pay-list{display:flex;flex-direction:column;gap:6px}
.apv-pay-row{display:grid;grid-template-columns:auto auto 1fr auto auto auto;gap:10px;align-items:center;font-size:.8rem;padding:7px 0;border-bottom:1px solid #f0ece6}
.apv-pay-src{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:100px}
.apv-pay-src.staff{background:#e6eaf3;color:#3a4a72}
.apv-pay-src.customer{background:#F3E9D3;color:#8a6d2f}
.apv-pay-amt{font-weight:800;color:#0B0F1A}
.apv-pay-meta{color:#6f7686}
.apv-pay-when{color:#8a93a8;font-size:.72rem}
.apv-pay-x{background:none;border:none;color:#a8442f;cursor:pointer;font-size:.8rem}
.apv-pay-confirm{display:inline-flex;gap:6px;align-items:center}
.apv-pay-yes{height:24px;padding:0 10px;border-radius:100px;border:none;background:#a8442f;color:#fff;font-size:.68rem;font-weight:800;cursor:pointer;font-family:inherit}
.apv-pay-no{height:24px;padding:0 10px;border-radius:100px;border:1px solid #d5d9e0;background:#fff;color:#41485a;font-size:.68rem;font-weight:700;cursor:pointer;font-family:inherit}
.apv-void-btn{margin-left:auto;height:22px;padding:0 10px;border-radius:100px;border:1px solid #e2c9c1;background:#fff;color:#a8442f;font-size:.66rem;font-weight:700;cursor:pointer;font-family:inherit}
.apv-void-confirm{margin-left:auto;display:inline-flex;gap:6px;align-items:center;font-size:.72rem;color:#7a5f1f}
.apv-void-yes{height:24px;padding:0 10px;border-radius:100px;border:none;background:#a8442f;color:#fff;font-size:.68rem;font-weight:800;cursor:pointer;font-family:inherit}
.apv-void-no{height:24px;padding:0 10px;border-radius:100px;border:1px solid #d5d9e0;background:#fff;color:#41485a;font-size:.68rem;font-weight:700;cursor:pointer;font-family:inherit}
.apv-pay-row.pending{background:#fdf7e9;border-radius:8px;padding-left:8px;padding-right:8px}
.apv-pay-pending{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:100px;background:#F3E9D3;border:1px solid #d9c48f;color:#7a5f1f;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
.apv-pay-ok{height:26px;padding:0 11px;border-radius:100px;border:none;background:#2f7d5a;color:#fff;font-size:.7rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.apv-pay-ok:hover{filter:brightness(1.08)}
.apv-pay-total{display:flex;justify-content:space-between;font-size:.86rem;font-weight:800;color:#0B0F1A;padding-top:8px}
.apv-pay-total.pending{font-size:.76rem;color:#7a5f1f;padding-top:2px}
.apv-pay-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.apv-pay-form .apv-input.num{width:110px}
.apv-pay-form .apv-input:not(.num):not(select){flex:1;min-width:130px}

/* ---- Redesigned payments card ---- */
.apv-pay-card{gap:16px}
.apv-bal{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;
  background:#0B0F1A;border-radius:12px;padding:16px 18px;color:#FAF8F4}
.apv-bal.paid{background:#12321f}
.apv-bal-main{display:flex;flex-direction:column;gap:2px}
.apv-bal-lbl{font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#C9A96E}
.apv-bal.paid .apv-bal-lbl{color:#7fe0ab}
.apv-bal-amt{font-size:1.9rem;font-weight:800;line-height:1;letter-spacing:-.01em}
.apv-bal-side{display:flex;flex-direction:column;gap:3px;text-align:right;font-size:.78rem;color:#aab0bd}
.apv-bal-side b{color:#fff;font-weight:800;margin-left:5px}
.apv-bal-side .apv-ok{color:#8fe0b0}.apv-bal-side .apv-ok b{color:#8fe0b0}
.apv-bal-side .apv-pend{color:#e6c982}.apv-bal-side .apv-pend b{color:#e6c982}

.apv-hist{display:flex;flex-direction:column;gap:0;border:1px solid #ece8e0;border-radius:10px;overflow:hidden}
.apv-hist-hd{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a8378;background:#f7f4ee;padding:8px 12px;border-bottom:1px solid #ece8e0}
.apv-hrow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid #f3efe8}
.apv-hrow:last-child{border-bottom:none}
.apv-hrow.pending{background:#fdf9ef}
.apv-hrow-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.apv-hrow-amt{font-size:1rem;font-weight:800;color:#0B0F1A}
.apv-hrow-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.74rem;color:#6f7686}
.apv-hrow-kind{text-transform:capitalize}
.apv-hrow-note{font-style:italic;color:#8a8378}
.apv-hrow-when{color:#a7a094}
.apv-hrow-acts{display:flex;align-items:center;gap:8px;flex-shrink:0}
.apv-hrow-ok{font-size:.68rem;font-weight:800;color:#1d7a3a;white-space:nowrap}

.apv-payform{border:1px dashed #d9d0bd;border-radius:12px;background:#fcfaf5;padding:14px;display:flex;flex-direction:column;gap:12px}
.apv-payform-hd{font-size:.8rem;font-weight:800;color:#0B0F1A}
.apv-payform-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.apv-fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.apv-fld>span{font-size:.7rem;font-weight:700;color:#6f7686;text-transform:uppercase;letter-spacing:.03em}
.apv-fld>span em{font-style:normal;font-weight:500;text-transform:none;color:#a7a094}
.apv-fld .apv-input{width:100%;height:40px}
.apv-fld-wide{grid-column:1 / -1}
.apv-payform-btn{align-self:flex-start;height:42px;padding:0 26px}
@media(max-width:560px){.apv-payform-grid{grid-template-columns:1fr}}

.apv-wo{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.apv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:#0B0F1A;color:#fff;font-size:.82rem;font-weight:700;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(0,0,0,.32);display:flex;align-items:center;gap:8px}
.apv-toast svg{color:#5FB88A}
`;
