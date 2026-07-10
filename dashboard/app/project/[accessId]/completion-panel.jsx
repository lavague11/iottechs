"use client";
import { useState } from "react";
import { completeProjectAction, setCommissionAction, setPayoutAction } from "./actions";
import { downloadCompletionPdf } from "../../../lib/completion-pdf";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Completion stage — the job is done and handed off.
//   • Customer sees a celebratory "system live" panel: certificate of completion, warranty, and a
//     short welcome guide. No pricing, no internal figures.
//   • Admin/manager also get an internal wrap-up: approve the sales commission and stamp the
//     project complete (which closes it). "Print" produces a clean certificate for records.
// Warranty is a standard 1-year parts & labour term running from the completion (or install) date.

const WARRANTY_MONTHS = 12;

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(String(d).includes("T") || String(d).includes(" ") ? d.replace(" ", "T") : d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return String(d); }
}
function addMonths(d, m) {
  try { const dt = new Date(String(d).replace(" ", "T")); dt.setMonth(dt.getMonth() + m); return dt.toISOString().slice(0, 10); }
  catch { return null; }
}

export default function CompletionPanel({ project, proposal, role, readOnly, onStageChange, onCompletedChange }) {
  const isCustomer = role === "customer";
  const isStaff = ["admin", "manager"].includes(role);
  const canWrap = isStaff && !readOnly;
  const assignedTech = proposal?.tech_signed_name || project.tech || null;

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
  const [commStatus, setCommStatus] = useState(project.commission_status || "pending");
  const [payoutAmt, setPayoutAmt] = useState(project.payout_amount ? String(project.payout_amount) : "");
  const [payoutStatus, setPayoutStatus] = useState(project.payout_status || "pending");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const doneDate = completedAt || project.install_date || project.date || null;
  const warrantyEnd = doneDate ? addMonths(doneDate, WARRANTY_MONTHS) : null;
  const hasRep = isStaff && project.sales_rep && (+project.commission_rate > 0);

  async function markComplete(done) {
    setBusy(true); setErr(null);
    const r = await completeProjectAction(project.access_id, done);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setCompletedAt(r.completed_at);
    onCompletedChange?.(r.completed_at || null);
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
          <div className="cmp-hero-title">{isCustomer ? "Your system is live." : "Project complete."}</div>
          <div className="cmp-hero-sub">{isCustomer ? "Installation is complete and your cameras are online. Here's everything you need." : `${deviceCount} device${deviceCount === 1 ? "" : "s"} installed and verified in QC.`}</div>
        </div>
      </div>

      {/* Certificate */}
      <div className="cmp-cert" id="cmp-cert">
        <div className="cmp-cert-head">
          <span className="cmp-cert-brand">IOT TECHS</span>
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
          <div className="cmp-card-title">{WARRANTY_MONTHS}-Month Warranty · Parts &amp; Labour</div>
          <div className="cmp-card-sub">{doneDate ? <>In effect {fmtDate(doneDate)} → <b>{fmtDate(warrantyEnd)}</b>. Covered issues are serviced at no charge.</> : "Coverage begins on the completion date."}</div>
        </div>
      </div>

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

      {/* Internal wrap-up */}
      {isStaff && (
        <div className="cmp-wrap">
          <div className="cmp-wrap-hd">Wrap-up <span>Internal</span></div>
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
            <div><div className="cmp-wrap-lbl">Job completion</div><div className="cmp-wrap-meta">{completedAt ? `Completed ${fmtDate(completedAt)}` : "Not marked complete yet"}</div></div>
            {canWrap && (completedAt
              ? <button className="cmp-btn ghost" disabled={busy} onClick={() => markComplete(false)}>Reopen</button>
              : <button className="cmp-btn" disabled={busy} onClick={() => markComplete(true)}>Mark Complete</button>)}
          </div>
        </div>
      )}

      {err && <div className="cmp-err">{err}</div>}

      <div className="cmp-actions">
        <button type="button" className="cmp-dl" onClick={() => downloadCompletionPdf(project, { deviceCount, completedAt, warrantyMonths: WARRANTY_MONTHS })}>Download PDF</button>
        <button type="button" className="cmp-print" onClick={() => window.print()}>Print</button>
      </div>
    </div>
  );
}

const CMP_CSS = `
.cmp-root{margin:16px 22px 4px;display:flex;flex-direction:column;gap:14px}
.cmp-hero{display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,#122a20,#1d3b2c);color:#eafaf1;border-radius:14px;padding:20px 22px}
.cmp-hero-ic{width:54px;height:54px;flex-shrink:0;border-radius:14px;background:rgba(255,255,255,.12);display:grid;place-items:center;color:#7fe0ab}
.cmp-hero-title{font-size:1.25rem;font-weight:800;font-family:'Bricolage Grotesque',sans-serif}
.cmp-hero-sub{font-size:.86rem;opacity:.85;margin-top:2px}
.cmp-cert{background:#fff;border:1px solid #d9d4ca;border-radius:14px;padding:20px 22px}
.cmp-cert-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid #ece7dd;padding-bottom:12px;margin-bottom:14px;flex-wrap:wrap;gap:6px}
.cmp-cert-brand{font-weight:800;letter-spacing:.08em;font-size:.9rem;color:#0B0F1A}
.cmp-cert-kicker{font-size:.78rem;font-weight:700;color:#9a8a5f;text-transform:uppercase;letter-spacing:.06em}
.cmp-cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}
.cmp-cert-f{display:flex;flex-direction:column;gap:3px}
.cmp-cert-f.cmp-wide{grid-column:1 / -1}
.cmp-cert-f span{font-size:.72rem;color:#8a93a8;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
.cmp-cert-f b{font-size:.94rem;color:#0B0F1A}
.cmp-cert-foot{margin-top:16px;font-size:.76rem;color:#8a8378;font-style:italic}
.cmp-card{display:flex;gap:13px;background:#fff;border:1px solid #d9d4ca;border-radius:12px;padding:14px 16px}
.cmp-warranty{border-left:4px solid #2f7d5a}
.cmp-card-ic{width:36px;height:36px;flex-shrink:0;border-radius:9px;background:#f2f9f4;color:#2f7d5a;display:grid;place-items:center}
.cmp-card-title{font-size:.9rem;font-weight:800;color:#0B0F1A}
.cmp-card-sub{font-size:.8rem;color:#6f7686;margin-top:2px}
.cmp-guide{border-left:4px solid #C9A96E}
.cmp-guide-list{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.cmp-guide-list li{font-size:.82rem;color:#41485a;line-height:1.45}
.cmp-wrap{background:#fbfaf8;border:1px solid #e2ddd2;border-radius:12px;padding:12px 16px}
.cmp-wrap-hd{font-size:.82rem;font-weight:800;color:#0B0F1A;display:flex;align-items:center;gap:8px;margin-bottom:8px}
.cmp-wrap-hd span{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#8a8378;background:#efeae0;border-radius:100px;padding:2px 8px}
.cmp-wrap-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid #ece7dd}
.cmp-wrap-row:first-of-type{border-top:none}
.cmp-wrap-lbl{font-size:.86rem;font-weight:700;color:#0B0F1A}
.cmp-wrap-meta{font-size:.76rem;color:#6f7686;margin-top:1px}
.cmp-btn{height:32px;padding:0 14px;border:none;border-radius:8px;background:#2f7d5a;color:#fff;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit}
.cmp-btn.ghost{background:#fff;border:1px solid #d5d9e0;color:#41485a}
.cmp-paid{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#1d7a3a;background:#f2f9f4;border:1px solid #bfe0c9;border-radius:100px;padding:4px 11px}
.cmp-payout-ctrl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.cmp-payout-dollar{display:inline-flex;align-items:center;gap:2px;font-size:.86rem;font-weight:700;color:#0B0F1A}
.cmp-payout-in{width:74px;height:32px;border:1px solid #d5d9e0;border-radius:8px;padding:0 8px;font-size:.86rem;font-family:inherit;text-align:right}
.cmp-err{font-size:.82rem;color:#a8442f;background:#fdeceb;border:1px solid #e0b0a8;border-radius:8px;padding:8px 10px}
.cmp-actions{display:flex;gap:8px}
.cmp-dl{height:36px;padding:0 16px;border:none;border-radius:8px;background:#0B0F1A;color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit}
.cmp-dl:hover{background:#1d2230}
.cmp-print{height:36px;padding:0 14px;border:1px solid #d5d9e0;background:#fff;border-radius:8px;font-size:.78rem;font-weight:700;color:#41485a;cursor:pointer;font-family:inherit}
@media print{.cmp-hero,.cmp-wrap,.cmp-actions,.cmp-guide{display:none}.cmp-root{margin:0}}
`;
