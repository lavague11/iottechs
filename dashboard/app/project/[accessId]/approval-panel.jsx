"use client";
import { useState, useEffect, useRef } from "react";
import { optionTotals, fmtSignStamp } from "../../../lib/proposal";
import { getApprovalDataAction, signProposalAction, recordPaymentAction, deletePaymentAction, confirmPaymentAction, createWorkOrderAction, voidProposalSignatureAction } from "./proposal-actions";
import ProposalSignModal from "./proposal-sign-modal";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Approval & Deposit stage — one pipeline, in order:
//   ① Proposal accepted → ② Agreement signed → ③ Deposit received → ④ Work order created.
// The step trail up top shows exactly where things stand; each section below completes one step.
// Customer signs (same signature tool as accepting) and acknowledges payments; staff record
// actual received payments and create the work order once it's signed AND a deposit is on file.
export default function ApprovalPanel({ accessId, role, customerName, customerAddress, onStageChange, onBrowseStage }) {
  const isStaff = ["admin", "manager"].includes(role);
  const isCustomer = role === "customer";
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (m) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };
  const [signOpen, setSignOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "Zelle", kind: "deposit", note: "" });
  const [woCreated, setWoCreated] = useState(false);
  const [delPayId, setDelPayId] = useState(null);   // payment pending delete-confirm
  const [voidSigOpen, setVoidSigOpen] = useState(false);

  useEffect(() => {
    let live = true;
    getApprovalDataAction(accessId).then((r) => { if (live && r?.ok) setData(r); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  if (!data) {
    return <div className="apv-root"><style>{APV_CSS}</style><div className="apv-empty">Loading approval…</div></div>;
  }
  const p = data.proposal;
  const accepted = p && p.payload && p.status === "accepted";
  if (!accepted) {
    return (
      <div className="apv-root">
        <style>{APV_CSS}</style>
        <div className="apv-header"><span className="apv-brand">IOT TECHS</span><span className="apv-doctag">Approval &amp; Deposit</span></div>
        <div className="apv-empty">Accept a proposal option first — the agreement, signature, and deposit unlock here once it’s accepted.</div>
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

  // Pipeline states for the step trail.
  const steps = [
    { label: "Accepted", done: true },
    { label: "Signed", done: signed },
    { label: "Deposit", done: depositOk },
    { label: "Work Order", done: woCreated || !!p.tech_signed_name },
  ];
  const nextIdx = steps.findIndex((s) => !s.done);

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
    setPay({ amount: "", method: pay.method, kind: "deposit", note: "" });
    showToast(isCustomer ? "Payment submitted — here's what happens next" : "Payment recorded");
    followStage(r.stage);
    // The customer's natural next step after paying is the scheduling page — take them there
    // (view navigation only; the project stage itself moves when staff confirm the money).
    if (isCustomer) setTimeout(() => onBrowseStage?.("schedule"), 900);
  }
  async function delPayment(id) {
    setBusy(true); setErr(null);
    const r = await deletePaymentAction(accessId, id);
    setBusy(false);
    setDelPayId(null);
    if (r?.error) { setErr(r.error); return; }
    setData((d) => ({ ...d, payments: r.payments }));
    showToast("Payment removed — archived");
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

      <div className="apv-header">
        <div className="apv-hd-left">
          <span className="apv-brand">IOT TECHS</span>
          <span className="apv-tagline">Secure Tomorrow. Today.</span>
        </div>
        <span className="apv-doctag">Approval &amp; Deposit</span>
      </div>

      {/* Step trail — where this approval stands, at a glance */}
      <div className="apv-steps">
        {steps.map((s, i) => (
          <div key={s.label} className={`apv-step${s.done ? " done" : ""}${i === nextIdx ? " next" : ""}`}>
            <span className="apv-step-dot">{s.done ? "✓" : i + 1}</span>
            <span className="apv-step-lbl">{s.label}</span>
            {i < steps.length - 1 && <span className="apv-step-line" />}
          </div>
        ))}
      </div>

      {err && <div className="apv-note err">{err}</div>}

      {/* Compact recap + the money picture in one box */}
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

      {/* ② Signature */}
      <div className="apv-section-hd">Signature</div>
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

      {/* ③ Deposit / payments */}
      <div className="apv-section-hd">Deposit &amp; Payments</div>
      <div className="apv-card">
        {payments.length > 0 ? (
          <div className="apv-pay-list">
            {payments.map((x) => (
              <div key={x.id} className={`apv-pay-row${x.status === "pending" ? " pending" : ""}`}>
                <span className={`apv-pay-src ${x.source}`}>{x.source === "customer" ? "Customer" : "Staff"}</span>
                <span className="apv-pay-amt">{money(x.amount)}</span>
                <span className="apv-pay-meta">
                  {x.kind}{x.method ? ` · ${x.method}` : ""}{x.note ? ` · ${x.note}` : ""}
                  {x.status === "pending" && <span className="apv-pay-pending">Pending confirmation</span>}
                </span>
                <span className="apv-pay-when">{x.created_at ? String(x.created_at).slice(0, 10) : ""}</span>
                {isStaff && x.status === "pending" && delPayId !== x.id && (
                  <button className="apv-pay-ok" title="Confirm received" disabled={busy} onClick={() => confirmPayment(x.id)}>✓ Confirm</button>
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
            ))}
            <div className="apv-pay-total"><span>Total received</span><b>{money(paidTotal)}</b></div>
            {pendingTotal > 0 && (
              <div className="apv-pay-total pending"><span>Awaiting confirmation</span><b>{money(pendingTotal)}</b></div>
            )}
          </div>
        ) : (
          <div className="apv-await">No payments recorded yet{depositDue > 0 ? ` — deposit of ${money(depositDue)} due to get started.` : "."}</div>
        )}

        <div className="apv-pay-form">
          <input className="apv-input num" type="number" min="0" step="0.01" placeholder="Amount"
                 value={pay.amount} onChange={(e) => setPay((v) => ({ ...v, amount: e.target.value }))} />
          {depositDue > 0 && !pay.amount && (
            <button type="button" className="apv-chip-btn" onClick={() => setPay((v) => ({ ...v, amount: depositDue.toFixed(2), kind: "deposit" }))}>
              Use deposit {money(depositDue)}
            </button>
          )}
          <select className="apv-input" value={pay.method} onChange={(e) => setPay((v) => ({ ...v, method: e.target.value }))}>
            <option>Zelle</option><option>Certified Check</option><option>Cash</option><option>Card</option><option>Wire</option><option>Other</option>
          </select>
          {isStaff && (
            <select className="apv-input" value={pay.kind} onChange={(e) => setPay((v) => ({ ...v, kind: e.target.value }))}>
              <option value="deposit">Deposit</option><option value="partial">Partial</option><option value="final">Final</option><option value="other">Other</option>
            </select>
          )}
          <input className="apv-input" placeholder="Note (optional)" value={pay.note} onChange={(e) => setPay((v) => ({ ...v, note: e.target.value }))} />
          <button className="apv-btn gold" disabled={busy || !(+pay.amount > 0)} onClick={addPayment}>
            {isCustomer ? "I Paid This" : "Record Payment"}
          </button>
        </div>
        {isCustomer && <div className="apv-fine">Your submission shows as pending until our team confirms receipt — the balance updates once confirmed.</div>}
      </div>

      {/* ④ Staff: create the work order once signed + deposit on file */}
      {isStaff && (
        <>
          <div className="apv-section-hd">Work Order</div>
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

      <div className="apv-footer">IOT TECHS · (646) 396-0775 · support@iot-techs.com · Confidential</div>

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
.apv-root{background:#FAF8F4;border-radius:14px;border:1px solid #d9d4ca;overflow:hidden;margin:18px 0;
  box-shadow:0 10px 30px rgba(11,15,26,.08);font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.apv-header{background:#0B0F1A;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-top:4px solid #C9A96E}
.apv-hd-left{display:flex;flex-direction:column;gap:2px}
.apv-brand{font-size:1.2rem;font-weight:800;color:#fff;letter-spacing:.02em}
.apv-tagline{font-size:.66rem;font-weight:600;color:#C9A96E;letter-spacing:.03em}
.apv-doctag{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#C9A96E;border:1px solid rgba(201,169,110,.4);border-radius:100px;padding:5px 13px}
.apv-empty{padding:34px 22px;text-align:center;color:#6f7686;font-size:.86rem}
.apv-note{margin:14px 22px 0;padding:9px 12px;border-radius:8px;font-size:.8rem;font-weight:600}
.apv-note.err{background:#FBE6E4;border:1px solid #e0b0a8;color:#a8442f}

/* Step trail */
.apv-steps{display:flex;align-items:center;gap:0;margin:16px 22px 0;background:#fff;border:1px solid #d9d4ca;border-radius:10px;padding:12px 14px;overflow-x:auto}
.apv-step{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.apv-step-dot{width:24px;height:24px;flex-shrink:0;border-radius:50%;border:1.5px solid #d9d4ca;background:#fff;color:#8a93a8;
  display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800}
.apv-step.done .apv-step-dot{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.apv-step.next .apv-step-dot{border-color:#C9A96E;color:#8a6d2f;box-shadow:0 0 0 3px rgba(201,169,110,.18)}
.apv-step-lbl{font-size:.72rem;font-weight:800;letter-spacing:.02em;color:#6f7686;white-space:nowrap}
.apv-step.done .apv-step-lbl{color:#1d5a2e}
.apv-step.next .apv-step-lbl{color:#8a6d2f}
.apv-step-line{flex:1;height:1.5px;background:#e6e1d6;margin:0 10px;min-width:14px}
.apv-step.done .apv-step-line{background:#9ec7ad}

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

.apv-section-hd{margin:18px 22px 0;background:#2C3347;color:#FAF8F4;font-size:.74rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:9px 12px;border-left:4px solid #C9A96E}
.apv-card{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
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

.apv-wo{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.apv-footer{margin-top:18px;background:#0B0F1A;border-top:2px solid #C9A96E;color:#9aa1af;font-size:.7rem;text-align:center;padding:11px 22px}
.apv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:#0B0F1A;color:#fff;font-size:.82rem;font-weight:700;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(0,0,0,.32);display:flex;align-items:center;gap:8px}
.apv-toast svg{color:#5FB88A}
`;
