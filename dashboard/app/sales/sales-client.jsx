"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (n || 0).toLocaleString();
const STAGE_PILL = {
  inquiry: ["s-survey","Inquiry"], site_survey: ["s-survey","Survey"],
  proposal: ["s-proposal","Proposal"], approval_deposit: ["s-proposal","Approval"],
  schedule: ["s-install","Schedule"], install: ["s-install","Install"],
  qc: ["s-qc","QC"], payment: ["s-qc","Payment"], completion: ["s-done","Completed"],
};
function Pill({ stage }) { const [cls, lbl] = STAGE_PILL[stage] || ["s-survey", stage]; return <span className={`stage-pill ${cls}`}>{lbl}</span>; }

export default function SalesClient({ user, alerts, pipeline, active, completed, upgrades, followUp, tickets, customers, stats }) {
  const [tab, setTab] = useState("pipeline");
  const sets = { pipeline, active, upgrades, completed };
  const rows = (sets[tab] || []).slice(0, 20);
  const openTickets = (tickets || []).filter(t => t.status !== "closed");

  const first = (user.name || "Sales").split(/\s+/)[0].replace(/\(.*\)/, "").trim();

  const KPI = [
    { cls: "c-gold",   label: "Pipeline Value",       val: money(stats.pipelineValue) },
    { cls: "c-green",  label: "Closed Value",          val: money(stats.closedValue) },
    { cls: "c-amber",  label: "Commission Pending",    val: money(stats.commPending) },
    { cls: "c-purple", label: "Commission Paid",       val: money(stats.commPaid) },
    { cls: "c-blue",   label: "Follow-ups Due",        val: stats.followUpCount, big: true },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="sales">
      <style>{SL_CSS}</style>
      <div className="apx-wrap">

        <div className="welcome">
          <h1>Hey, <em>{first}</em>. You have <em>{stats.pipelineCount}</em> deals in the pipeline.</h1>
        </div>

        <div className="kpi-row k5">
          {KPI.map((k) => (
            <div key={k.label} className={`kpi ${k.cls}`}>
              <div className="k-label">{k.label}</div>
              <div className="k-val" style={{ fontSize: k.big ? undefined : "1.35rem" }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* ── Pipeline ── */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Projects</h3>
            <div className="ph-right"><div className="tab-row">
              {[["pipeline",`Pipeline (${pipeline.length})`],["active",`Active (${active.length})`],["upgrades",`Upgrades (${upgrades.length})`],["completed",`Closed (${completed.length})`]].map(([k,lbl]) => (
                <button key={k} className={tab===k?"on":""} onClick={()=>setTab(k)}>{lbl}</button>
              ))}
            </div></div>
          </div>
          {rows.length === 0 ? <div className="empty">No projects in this view.</div> : (
            <table className="dtable">
              <thead><tr><th>Project</th><th>Customer</th><th>Stage</th><th className="num">Value</th><th className="num">Commission</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j.access_id}>
                    <td><Link href={`/project/${j.access_id}`} className="mono idlink">{j.access_id}</Link></td>
                    <td><div className="name-cell">{j.customer}</div><div style={{ fontSize:".76rem",color:"var(--muted)" }}>{j.service}</div></td>
                    <td><Pill stage={j.stage} /></td>
                    <td className="num">{j.value ? money(j.value) : "—"}</td>
                    <td className="num">
                      {j.commission_rate > 0
                        ? <span className="sl-comm">{money(j.commission_amount)} <span className="sl-comm-rate">({j.commission_rate}%)</span></span>
                        : <span style={{ color:"var(--muted)" }}>—</span>}
                    </td>
                    <td>
                      {j.commission_rate > 0
                        ? <span className={`pay-badge ${j.commission_status}`}>{j.commission_status}</span>
                        : null}
                    </td>
                    <td className="num"><Link href={`/project/${j.access_id}`} className="idlink">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Follow-up & Tickets ── */}
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Needs Follow-up</h3>
              <span className="chip value">{(followUp||[]).length}</span>
            </div>
            {(followUp||[]).length === 0 && <div className="empty">No proposals pending follow-up.</div>}
            {(followUp||[]).slice(0,8).map(j => (
              <div className="sl-row" key={j.access_id}>
                <div className="sl-row-main">
                  <div className="sl-row-name">{j.customer}</div>
                  <div className="sl-row-sub">{j.service} · {j.address}</div>
                </div>
                <div className="sl-row-right">
                  <Pill stage={j.stage} />
                  <Link href={`/project/${j.access_id}`} className="idlink" style={{ fontSize:".78rem" }}>Open →</Link>
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Customer Tickets</h3>
              <Link href="/tickets" className="btn btn-ghost btn-sm">View All</Link>
            </div>
            {openTickets.length === 0 && <div className="empty">No open customer tickets.</div>}
            {openTickets.slice(0,6).map(t => (
              <div className="sl-ticket" key={t.id}>
                <span className={`tk-t-pri tk-pri-${t.priority}`}>{t.priority}</span>
                <div className="sl-t-body">
                  <div className="sl-t-subj">{t.subject}</div>
                  {t.access_id && <div className="sl-t-meta">Project #{t.access_id}</div>}
                </div>
                <span className={`chip ${t.status==="open"?"value":"done"}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Customers ── */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Customers</h3>
            <Link href="/customers" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          {(customers||[]).length === 0 && <div className="empty">No customers yet.</div>}
          <div className="sl-cust-grid">
            {(customers||[]).slice(0,12).map(name => (
              <div className="sl-cust" key={name}>
                <div className="sl-cust-av">{name.charAt(0).toUpperCase()}</div>
                <div className="sl-cust-name">{name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upgrade Opportunities ── */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Upgrade Opportunities</h3>
            <span className="chip">{upgrades.length}</span>
          </div>
          {upgrades.length === 0 && <div className="empty">No upgrade opportunities identified.</div>}
          {upgrades.slice(0,6).map(j => (
            <div className="sl-row" key={j.access_id}>
              <div className="sl-row-main">
                <div className="sl-row-name">{j.customer}</div>
                <div className="sl-row-sub">{j.service}</div>
              </div>
              <div className="sl-row-right">
                {j.value && <span className="sl-val">{money(j.value)}</span>}
                <Link href={`/project/${j.access_id}`} className="idlink" style={{ fontSize:".78rem" }}>Open →</Link>
              </div>
            </div>
          ))}
        </div>

      </div>
    </AdminShell>
  );
}

const SL_CSS = `
.apx .sl-comm{font-weight:700;font-size:.85rem;color:#1c8a45}
.apx .sl-comm-rate{font-weight:400;font-size:.75rem;color:var(--muted)}
.apx .pay-badge{display:inline-block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:6px}
.apx .pay-badge.pending{background:rgba(41,128,185,.1);color:#2980b9}
.apx .pay-badge.paid{background:rgba(28,138,69,.12);color:#1c8a45}
.apx .pay-badge.declined{background:rgba(231,76,60,.1);color:#e74c3c}

.apx .sl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid var(--line);transition:.12s}
.apx .sl-row:last-child{border-bottom:none}
.apx .sl-row:hover{background:var(--bg-soft)}
.apx .sl-row-main{min-width:0}
.apx .sl-row-name{font-weight:600;font-size:.88rem}
.apx .sl-row-sub{font-size:.75rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apx .sl-row-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
.apx .sl-val{font-weight:700;font-size:.86rem;color:var(--accent)}

.apx .sl-ticket{display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--line)}
.apx .sl-ticket:last-child{border-bottom:none}
.apx .sl-t-body{flex:1;min-width:0}
.apx .sl-t-subj{font-weight:600;font-size:.86rem}
.apx .sl-t-meta{font-size:.74rem;color:var(--muted);margin-top:1px}
.apx .tk-t-pri{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:6px;white-space:nowrap;flex-shrink:0}
.apx .tk-pri-urgent{background:rgba(231,76,60,.12);color:#c0392b}
.apx .tk-pri-medium{background:rgba(224,154,58,.12);color:#8a5f00}
.apx .tk-pri-low{background:rgba(99,117,155,.1);color:#5a6d8a}

.apx .sl-cust-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:14px 18px}
.apx .sl-cust{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;transition:.12s;cursor:default}
.apx .sl-cust:hover{background:var(--bg-soft)}
.apx .sl-cust-av{width:32px;height:32px;border-radius:50%;background:var(--accent-primary-soft,#f0e8d8);color:var(--accent-primary,#C9A96E);display:grid;place-items:center;font-weight:700;font-size:.85rem;flex-shrink:0;font-family:'Bricolage Grotesque',sans-serif}
.apx .sl-cust-name{font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;
