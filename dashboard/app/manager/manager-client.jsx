"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (n || 0).toLocaleString();
const STAGE_PILL = {
  inquiry: ["s-survey", "Inquiry"], site_survey: ["s-survey", "Survey"],
  proposal: ["s-proposal", "Proposal"], approval_deposit: ["s-proposal", "Approval"],
  schedule: ["s-install", "Schedule"], install: ["s-install", "Install"],
  qc: ["s-qc", "QC"], payment: ["s-qc", "Payment"], completion: ["s-done", "Completed"],
};
function Pill({ stage }) { const [cls, lbl] = STAGE_PILL[stage] || ["s-survey", stage]; return <span className={`stage-pill ${cls}`}>{lbl}</span>; }
function initials(name) { return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }

export default function ManagerClient({ user, alerts, jobs, stats, approvals: initApprovals, techs }) {
  const [tab, setTab] = useState("active");
  const [approvals, setApprovals] = useState(initApprovals);

  const filtered = jobs.filter((j) =>
    tab === "all" ? true :
    tab === "active" ? ["open", "service"].includes(j.category) :
    tab === "pending" ? j.category === "pending" :
    j.category === "completed"
  ).slice(0, 12);

  const KPI = [
    { cls: "c-gold",   label: "Total Projects", val: stats.total,                  big: true },
    { cls: "c-blue",   label: "Active",         val: stats.active,                 big: true },
    { cls: "c-amber",  label: "Pipeline Value", val: money(stats.pipelineVal) },
    { cls: "c-purple", label: "Active Value",   val: money(stats.activeVal) },
    { cls: "c-green",  label: "Revenue",        val: money(stats.revenue) },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="manager">
      <div className="apx-wrap">
        <div className="page-head"><h1>Manager Dashboard</h1><div className="ph-sub">Operations · pipeline · approvals</div></div>

        <div className="kpi-row k5">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val" style={{ fontSize: k.big ? undefined : "1.35rem" }}>{k.val}</div></div>)}
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Projects</h3>
              <div className="ph-right"><div className="tab-row">
                {[["active", "Active"], ["pending", "Pending"], ["completed", "Completed"], ["all", "All"]].map(([k, lbl]) => (
                  <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{lbl}</button>
                ))}
              </div></div>
            </div>
            {filtered.length === 0 ? <div className="empty">No projects in this view.</div> : (
              <table className="dtable">
                <thead><tr><th>Customer</th><th>Stage</th><th>Tech</th><th className="num">Value</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((j) => (
                    <tr key={j.access_id}>
                      <td><div className="name-cell">{j.customer}</div><div style={{ fontSize: ".76rem", color: "var(--muted)" }}>{j.service}</div></td>
                      <td><Pill stage={j.stage} /></td>
                      <td style={{ color: "var(--muted)" }}>{j.tech || "—"}</td>
                      <td className="num">{j.value ? money(j.value) : "—"}</td>
                      <td className="num"><Link href={`/project/${j.access_id}`} className="idlink">Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Approvals</h3><span className="chip">{approvals.length}</span></div>
            {approvals.length === 0 ? <div className="empty">No pending approvals.</div> : approvals.map((a, i) => (
              <div key={i} style={{ padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div><div style={{ fontWeight: 700, fontSize: ".88rem" }}>{a.type}</div><div style={{ fontSize: ".78rem", color: "var(--muted)" }}>{a.customer} · {a.project} · {a.tech}</div></div>
                  <div style={{ fontWeight: 700 }}>{money(a.amount)}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-gold btn-sm" onClick={() => setApprovals((p) => p.filter((_, j) => j !== i))}>Approve</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setApprovals((p) => p.filter((_, j) => j !== i))}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel mb">
          <div className="panel-head"><h3>Technician Performance</h3><Link className="more" href="/users">Manage →</Link></div>
          {techs.length === 0 ? <div className="empty">No technician activity.</div> : (
            <table className="dtable">
              <thead><tr><th>Technician</th><th className="num">Active</th><th className="num">Completed</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {techs.map((t) => (
                  <tr key={t.name}>
                    <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="uav" style={{ width: 30, height: 30, fontSize: ".74rem" }}>{initials(t.name)}</div><span className="name-cell">{t.name}</span></div></td>
                    <td className="num">{t.active}</td>
                    <td className="num">{t.completed}</td>
                    <td className="num">{money(t.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
