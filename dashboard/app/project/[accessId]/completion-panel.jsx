"use client";
import { useState, useEffect } from "react";
import { completeProjectAction, setCommissionAction, setPayoutAction, setWarrantyAction } from "./actions";
import { getApprovalDataAction } from "./proposal-actions";
import { optionTotals } from "../../../lib/proposal";
import { downloadCompletionPdf } from "../../../lib/completion-pdf";
import SystemQrModal from "./system-qr-modal";
import { TaglinePill } from "../../components/brand";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Completion stage — the job is done and handed off.
//   • Customer sees a celebratory "system live" panel: certificate of completion, warranty, and a
//     short welcome guide. No pricing, no internal figures.
//   • Admin/manager also get an internal wrap-up: approve the sales commission and stamp the
//     project complete (which closes it). "Print" produces a clean certificate for records.
// Warranty is a standard 1-year parts & labour term running from the completion (or install) date.

const WARRANTY_TERMS = [{ m: 6, label: "6 months" }, { m: 12, label: "12 months" }, { m: 24, label: "2 years" }];

// Local date as YYYY-MM-DD (for the date input default), from a stamp or now.
function toDateInput(d) {
  try {
    if (d) { const m = String(d).match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; }
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  } catch { return ""; }
}

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(String(d).includes("T") || String(d).includes(" ") ? d.replace(" ", "T") : d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return String(d); }
}
function addMonths(d, m) {
  try { const dt = new Date(String(d).replace(" ", "T")); dt.setMonth(dt.getMonth() + m); return dt.toISOString().slice(0, 10); }
  catch { return null; }
}

export default function CompletionPanel({ project, proposal, role, readOnly, onStageChange, onCompletedChange, onBrowseStage }) {
  const isCustomer = role === "customer";
  const isStaff = ["admin", "manager"].includes(role);
  const canWrap = isStaff && !readOnly;
  const assignedTech = proposal?.tech_signed_name || project.tech || null;

  // Final-payment gate: the customer's certificate, warranty, welcome guide and app access only
  // unlock once the balance is paid in full. Staff always see everything. We pull the same
  // payments + add-ons the approval panel uses and compute the balance against the accepted option.
  const [payData, setPayData] = useState(null);   // null = not loaded yet
  useEffect(() => {
    let live = true;
    getApprovalDataAction(project.access_id).then((r) => { if (live && r?.ok) setPayData(r); }).catch(() => {});
    return () => { live = false; };
  }, [project.access_id]);

  const acceptedOpt = proposal?.payload?.options?.find((o) => o.id === proposal.selected_option) || proposal?.payload?.options?.[0] || null;
  const grand = acceptedOpt
    ? optionTotals(acceptedOpt, proposal.tax_rate, proposal.payload.discount, proposal.deposit_pct, proposal.payload.pcp_credit).grand
    : 0;
  const addonsTotal = +payData?.addons?.total || 0;
  const owed = grand + addonsTotal;
  const paidTotal = (payData?.payments || []).filter((x) => x.status !== "pending").reduce((s, x) => s + (+x.amount || 0), 0);
  const balance = Math.max(0, owed - paidTotal);
  const payLoaded = payData !== null;
  const paidInFull = owed <= 0 || (payLoaded && balance <= 0.01);
  // Gate the customer until we've loaded payments AND they're paid in full. While loading we hold
  // the deliverables back (safer than flashing them, then hiding).
  const gated = isCustomer && !paidInFull;

  // Device count from the accepted option (cameras + recorder + other equipment; skip labour).
  const deviceCount = (() => {
    const LABOR_RX = /drop|cable|run|termination|mount|management|program|setup|labor|install|per diem|test|tone|waterproof/i;
    const opt = proposal?.payload?.options?.find((o) => o.id === proposal.selected_option) || proposal?.payload?.options?.[0];
    let n = 0;
    (opt?.services || []).forEach((s) => (s.items || []).forEach((it) => {
      const hasSub = (it.sub || []).length > 0;
      if ((s.key === "camera" || s.key === "toast" || s.key === "pos") && hasSub) n++;
      else if (/\bnvr\b|recorder/i.test(it.name)) n++;
      else if (!hasSub && !LABOR_RX.test(it.name)) n++;
    }));
    return n;
  })();

  const [completedAt, setCompletedAt] = useState(project.completed_at || null);
  const [warrantyMonths, setWarrantyMonths] = useState(+project.warranty_months || 6);
  // Completion date defaults to the existing stamp, else the job/install date, else today.
  const [completeDate, setCompleteDate] = useState(toDateInput(project.completed_at || project.install_date || project.date));
  const [commStatus, setCommStatus] = useState(project.commission_status || "pending");
  const [payoutAmt, setPayoutAmt] = useState(project.payout_amount ? String(project.payout_amount) : "");
  const [payoutStatus, setPayoutStatus] = useState(project.payout_status || "pending");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);

  const doneDate = completedAt || project.install_date || project.date || null;
  const warrantyEnd = doneDate ? addMonths(doneDate, warrantyMonths) : null;
  const warrantyLabel = WARRANTY_TERMS.find((t) => t.m === warrantyMonths)?.label || `${warrantyMonths} months`;
  const hasRep = isStaff && project.sales_rep && (+project.commission_rate > 0);

  async function markComplete(done) {
    setBusy(true); setErr(null);
    const r = await completeProjectAction(project.access_id, done, done ? completeDate : null);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setCompletedAt(r.completed_at);
    onCompletedChange?.(r.completed_at || null);
  }
  async function saveWarranty(m) {
    setWarrantyMonths(m);   // optimistic
    const r = await setWarrantyAction(project.access_id, m);
    if (r?.warranty_months) setWarrantyMonths(r.warranty_months);
  }
  async function approveCommission() {
    setBusy(true); setErr(null);
    const r = await setCommissionAction(project.access_id, { status: "paid" });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setCommStatus("paid");
  }
  async function savePayout(status) {
    setBusy(true); setErr(null);
    const r = await setPayoutAction(project.access_id, { amount: +payoutAmt || 0, status });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setPayoutAmt(r.payout_amount ? String(r.payout_amount) : "");
    setPayoutStatus(r.payout_status);
  }

  return (
    <div className="cmp-root">
      <style>{CMP_CSS}</style>

      {/* Hero */}
      <div className="cmp-hero">
        <div className="cmp-hero-ic">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
        </div>
        <div>
          <div className="cmp-hero-title">{gated ? "Installation complete." : isCustomer ? "Your system is live." : "Project complete."}</div>
          <div className="cmp-hero-sub">{gated ? "One last step — settle your final balance to unlock your certificate, warranty, and app access." : isCustomer ? "Installation is complete and your cameras are online. Here's everything you need." : `${deviceCount} device${deviceCount === 1 ? "" : "s"} installed and verified in QC.`}</div>
        </div>
      </div>

      {/* Final-payment gate (customer, unpaid) — withholds the deliverables until settled */}
      {gated && (
        <div className="cmp-gate">
          <div className="cmp-gate-ic">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div className="cmp-gate-body">
            <div className="cmp-gate-title">Final balance {payLoaded ? "due" : "…"}</div>
            <div className="cmp-gate-amt">{payLoaded ? money(balance) : "Checking payment status…"}</div>
            <div className="cmp-gate-sub">Your completion certificate, warranty document, and camera app access unlock the moment your final payment is recorded.</div>
            {onBrowseStage && payLoaded && (
              <button type="button" className="cmp-gate-btn" onClick={() => onBrowseStage("payment")}>Go to Payment</button>
            )}
          </div>
        </div>
      )}

      {!gated && (<>
      {/* Certificate */}
      <div className="cmp-cert" id="cmp-cert">
        <div className="cmp-cert-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="cmp-cert-brand">IOT TECHS</span>
            <TaglinePill tone="light" />
          </div>
          <span className="cmp-cert-kicker">Certificate of Completion</span>
        </div>
        <div className="cmp-cert-grid">
          <div className="cmp-cert-f"><span>Client</span><b>{project.company_name || project.contact_name || project.customer}</b></div>
          <div className="cmp-cert-f"><span>Project</span><b>{project.access_id}</b></div>
          {project.address && <div className="cmp-cert-f cmp-wide"><span>Job Site</span><b>{project.address}</b></div>}
          <div className="cmp-cert-f"><span>Devices Installed</span><b>{deviceCount}</b></div>
          <div className="cmp-cert-f"><span>Completed</span><b>{completedAt ? fmtDate(completedAt) : "Pending sign-off"}</b></div>
        </div>
        <div className="cmp-cert-foot">This certifies the above system was installed and passed quality control by IOT TECHS.</div>
      </div>

      {/* Warranty */}
      <div className="cmp-card cmp-warranty">
        <div className="cmp-card-ic">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div className="cmp-card-body">
          <div className="cmp-card-title">{warrantyLabel} Warranty · Parts &amp; Labour</div>
          <div className="cmp-card-sub">{doneDate ? <>In effect {fmtDate(doneDate)} → <b>{fmtDate(warrantyEnd)}</b>. Covered issues are serviced at no charge.</> : "Coverage begins on the completion date."}</div>
        </div>
      </div>

      {/* System QR — the branded activation card, saved from the install step */}
      {project.system_qr && (
        <div className="cmp-card cmp-qrcard">
          <div className="cmp-card-ic">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v-4M17 21h1"/></svg>
          </div>
          <div className="cmp-card-body">
            <div className="cmp-card-title">System QR · Activate your app</div>
            <div className="cmp-card-sub">Scan this in the ANNKE Vision app (tap +, top-right) to connect to your cameras.</div>
            <button type="button" className="cmp-btn cmp-qr-btn" onClick={() => setQrOpen(true)}>View System QR</button>
          </div>
        </div>
      )}

      {/* Customer welcome guide */}
      {isCustomer && (
        <div className="cmp-card cmp-guide">
          <div className="cmp-card-body">
            <div className="cmp-card-title">Getting started</div>
            <ul className="cmp-guide-list">
              <li>View your cameras anytime from the mobile app your technician set up on-site.</li>
              <li>Footage records continuously to your on-site recorder; remote viewing works from anywhere.</li>
              <li>Questions or a camera acting up? Open a support request from your project page — your warranty has you covered.</li>
            </ul>
          </div>
        </div>
      )}

      </>)}

      {/* Internal wrap-up */}
      {isStaff && (
        <div className="cmp-wrap">
          <div className="cmp-wrap-hd">
            <span className="cmp-wrap-ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg></span>
            Wrap-up
            <span className="cmp-wrap-tag">Internal</span>
            <span className={`cmp-wrap-status ${completedAt ? "done" : "pending"}`}>{completedAt ? "Complete" : "In progress"}</span>
          </div>
          {hasRep && (
            <div className="cmp-wrap-row">
              <div><div className="cmp-wrap-lbl">Sales commission</div><div className="cmp-wrap-meta">{project.sales_rep} · {project.commission_rate}%</div></div>
              {commStatus === "paid"
                ? <span className="cmp-paid">Approved</span>
                : canWrap && <button className="cmp-btn ghost" disabled={busy} onClick={approveCommission}>Approve</button>}
            </div>
          )}
          <div className="cmp-wrap-row">
            <div style={{ flex: 1 }}>
              <div className="cmp-wrap-lbl">Tech payout</div>
              <div className="cmp-wrap-meta">{assignedTech || "No technician assigned"}{payoutStatus === "paid" ? " · paid" : payoutStatus === "approved" ? " · approved" : ""}</div>
            </div>
            {payoutStatus === "paid"
              ? <span className="cmp-paid">Paid {money(payoutAmt)}</span>
              : canWrap ? (
                <div className="cmp-payout-ctrl">
                  <span className="cmp-payout-dollar">$<input type="number" min="0" step="1" className="cmp-payout-in" value={payoutAmt} onChange={(e) => setPayoutAmt(e.target.value)} placeholder="0" /></span>
                  {payoutStatus === "approved"
                    ? <><button className="cmp-btn" disabled={busy} onClick={() => savePayout("paid")}>Mark Paid</button><button className="cmp-btn ghost" disabled={busy} onClick={() => savePayout("pending")}>Undo</button></>
                    : <button className="cmp-btn ghost" disabled={busy || !(+payoutAmt > 0)} onClick={() => savePayout("approved")}>Approve</button>}
                </div>
              ) : <span className="cmp-wrap-meta">{payoutStatus === "approved" ? `Approved ${money(payoutAmt)}` : "Pending"}</span>}
          </div>
          <div className="cmp-wrap-row">
            <div><div className="cmp-wrap-lbl">Warranty term</div><div className="cmp-wrap-meta">Coverage runs from the completion date</div></div>
            {canWrap ? (
              <select className="cmp-sel" value={warrantyMonths} onChange={(e) => saveWarranty(+e.target.value)} disabled={busy}>
                {WARRANTY_TERMS.map((t) => <option key={t.m} value={t.m}>{t.label}</option>)}
              </select>
            ) : <span className="cmp-wrap-meta">{warrantyLabel}</span>}
          </div>
          <div className="cmp-wrap-row">
            <div style={{ flex: 1 }}>
              <div className="cmp-wrap-lbl">Job completion</div>
              <div className="cmp-wrap-meta">{completedAt ? `Completed ${fmtDate(completedAt)}` : "Not marked complete yet"}</div>
            </div>
            {canWrap && (completedAt
              ? <button className="cmp-btn ghost" disabled={busy} onClick={() => markComplete(false)}>Reopen</button>
              : (
                <div className="cmp-complete-ctrl">
                  <input type="date" className="cmp-date-in" value={completeDate} onChange={(e) => setCompleteDate(e.target.value)} disabled={busy} />
                  <button className="cmp-btn" disabled={busy || !completeDate} onClick={() => markComplete(true)}>Mark Complete</button>
                </div>
              ))}
          </div>
        </div>
      )}

      {err && <div className="cmp-err">{err}</div>}

      {!gated && (
        <div className="cmp-actions">
          <button type="button" className="cmp-dl" onClick={() => downloadCompletionPdf(project, { deviceCount, completedAt, warrantyMonths })}>Download PDF</button>
          <button type="button" className="cmp-print" onClick={() => window.print()}>Print</button>
        </div>
      )}

      {qrOpen && <SystemQrModal src={project.system_qr} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

const CMP_CSS = `
.cmp-root{margin:16px 0 4px;display:flex;flex-direction:column;gap:14px}
.cmp-hero{display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,#122a20,#1d3b2c);color:#eafaf1;border-radius:14px;padding:20px 22px}
.cmp-hero-ic{width:54px;height:54px;flex-shrink:0;border-radius:14px;background:rgba(255,255,255,.12);display:grid;place-items:center;color:#7fe0ab}
.cmp-hero-title{font-size:1.25rem;font-weight:800;font-family:'Bricolage Grotesque',sans-serif}
.cmp-hero-sub{font-size:.86rem;opacity:.85;margin-top:2px}
.cmp-cert{background:#fff;border:1px solid var(--line-warm);border-radius:14px;padding:20px 22px}
.cmp-cert-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid #ece7dd;padding-bottom:12px;margin-bottom:14px;flex-wrap:wrap;gap:6px}
.cmp-cert-brand{font-weight:800;letter-spacing:.08em;font-size:.9rem;color:var(--ink)}
.cmp-cert-kicker{font-size:.78rem;font-weight:700;color:#9a8a5f;text-transform:uppercase;letter-spacing:.06em}
.cmp-cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}
.cmp-cert-f{display:flex;flex-direction:column;gap:3px}
.cmp-cert-f.cmp-wide{grid-column:1 / -1}
.cmp-cert-f span{font-size:.72rem;color:#8a93a8;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
.cmp-cert-f b{font-size:.94rem;color:var(--ink)}
.cmp-cert-foot{margin-top:16px;font-size:.76rem;color:#8a8378;font-style:italic}
.cmp-card{display:flex;gap:13px;background:#fff;border:1px solid var(--line-warm);border-radius:12px;padding:14px 16px}
.cmp-warranty{border-left:4px solid var(--green)}
.cmp-card-ic{width:36px;height:36px;flex-shrink:0;border-radius:9px;background:#f2f9f4;color:var(--green);display:grid;place-items:center}
.cmp-card-title{font-size:.9rem;font-weight:800;color:var(--ink)}
.cmp-card-sub{font-size:.8rem;color:var(--muted);margin-top:2px}
.cmp-guide{border-left:4px solid var(--gold)}
.cmp-qrcard{border-left:4px solid var(--gold)}
.cmp-qr-btn{margin-top:10px;align-self:flex-start;background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:var(--ink)}
.cmp-guide-list{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.cmp-guide-list li{font-size:.82rem;color:#41485a;line-height:1.45}
.cmp-wrap{background:#fbfaf8;border:1px solid #e2ddd2;border-radius:12px;padding:12px 16px}
.cmp-wrap-hd{font-size:.92rem;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px;margin-bottom:8px}
.cmp-wrap-ic{width:26px;height:26px;flex-shrink:0;border-radius:7px;background:#efeae0;color:#8a8378;display:grid;place-items:center}
.cmp-wrap-tag{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#8a8378;background:#efeae0;border-radius:100px;padding:2px 8px}
.cmp-wrap-status{margin-left:auto;font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:4px 11px;border-radius:100px}
.cmp-wrap-status.done{background:var(--green-soft);color:var(--green)}
.cmp-wrap-status.pending{background:#f7f0df;color:#7a5f1f}
.cmp-wrap-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid #ece7dd}
.cmp-wrap-row:first-of-type{border-top:none}
.cmp-wrap-lbl{font-size:.86rem;font-weight:700;color:var(--ink)}
.cmp-wrap-meta{font-size:.76rem;color:var(--muted);margin-top:1px}
.cmp-btn{height:32px;padding:0 14px;border:none;border-radius:8px;background:var(--green);color:#fff;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit}
.cmp-btn.ghost{background:#fff;border:1px solid #d5d9e0;color:#41485a}
.cmp-paid{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--green);background:#f2f9f4;border:1px solid #bfe0c9;border-radius:100px;padding:4px 11px}
.cmp-payout-ctrl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.cmp-payout-dollar{display:inline-flex;align-items:center;gap:2px;font-size:.86rem;font-weight:700;color:var(--ink)}
.cmp-payout-in{width:74px;height:32px;border:1px solid #d5d9e0;border-radius:8px;padding:0 8px;font-size:.86rem;font-family:inherit;text-align:right}
.cmp-sel{height:38px;border:1px solid #d5d9e0;border-radius:8px;padding:0 8px;font-size:.82rem;font-weight:700;font-family:inherit;background:#fff;color:var(--ink);cursor:pointer}
.cmp-complete-ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.cmp-date-in{height:32px;border:1px solid #d5d9e0;border-radius:8px;padding:0 8px;font-size:.82rem;font-family:inherit;color:var(--ink)}
.cmp-err{font-size:.82rem;color:var(--red);background:#fdeceb;border:1px solid #e0b0a8;border-radius:8px;padding:8px 10px}
.cmp-gate{display:flex;gap:14px;background:#fff;border:1px solid #e5d3a1;border-left:4px solid var(--gold);border-radius:12px;padding:18px 20px}
.cmp-gate-ic{width:40px;height:40px;flex-shrink:0;border-radius:10px;background:#faf4e8;color:#a3812f;display:grid;place-items:center}
.cmp-gate-title{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9a8a5f}
.cmp-gate-amt{font-family:'Bricolage Grotesque',sans-serif;font-size:1.7rem;font-weight:800;color:var(--ink);line-height:1.1;margin:2px 0 6px}
.cmp-gate-sub{font-size:.83rem;color:var(--muted);line-height:1.45;max-width:520px}
.cmp-gate-btn{margin-top:12px;height:38px;padding:0 20px;border:none;border-radius:9px;background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:var(--ink);font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit}
.cmp-gate-btn:hover{filter:brightness(1.04)}
.cmp-actions{display:flex;gap:8px}
.cmp-dl{height:36px;padding:0 16px;border:none;border-radius:8px;background:var(--ink);color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit}
.cmp-dl:hover{background:#1d2230}
.cmp-print{height:36px;padding:0 14px;border:1px solid #d5d9e0;background:#fff;border-radius:8px;font-size:.78rem;font-weight:700;color:#41485a;cursor:pointer;font-family:inherit}
@media print{.cmp-hero,.cmp-wrap,.cmp-actions,.cmp-guide{display:none}.cmp-root{margin:0}}
`;
