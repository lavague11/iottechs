"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import { setPcpAction } from "./actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => "$" + Math.round(+n || 0).toLocaleString();
function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
  return isNaN(d) ? ts : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// How each credit is funded — the program is subsidized from these pools.
const SOURCES = [
  ["performance", "Technician performance"],
  ["donor", "Donor grant"],
  ["community", "Community"],
  ["company", "Company profits"],
];
const SOURCE_LABEL = Object.fromEntries(SOURCES);
const SOURCE_COLOR = { performance: "#7c3aed", donor: "#1c8a45", community: "#3257ff", company: "#b08f4f" };

export default function PcpClient({ user, alerts, credits }) {
  const [filter, setFilter] = useState("all");
  const [pending, startTx] = useTransition();
  const router = useRouter();

  const approved = credits.filter((c) => c.status === "approved");
  const pendingC = credits.filter((c) => c.status !== "approved");
  const totalGiven = approved.reduce((s, c) => s + c.amount, 0);
  const totalPending = pendingC.reduce((s, c) => s + c.amount, 0);

  // Approved credits grouped by funding source (unattributed rolled into its own bucket).
  const bySource = {};
  for (const c of approved) { const k = c.grantSource || "unattributed"; bySource[k] = (bySource[k] || 0) + c.amount; }

  const visible = credits.filter((c) => filter === "all" ? true : filter === "approved" ? c.status === "approved" : c.status !== "approved");

  function patch(accessId, p) { startTx(async () => { await setPcpAction(accessId, p); router.refresh(); }); }

  const KPI = [
    { cls: "c-green", label: "Given Back (approved)", val: money0(totalGiven) },
    { cls: "c-amber", label: "Pending", val: money0(totalPending) },
    { cls: "c-gold",  label: "Credits", val: credits.length, big: true },
    { cls: "c-blue",  label: "Avg Credit", val: credits.length ? (credits.reduce((s, c) => s + (c.pct || 0), 0) / credits.length).toFixed(1) + "%" : "—" },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="pcp">
      <div className="apx-wrap">
        <div className="page-head">
          <h1>Performance Credit Program</h1>
          <div className="ph-sub">Discretionary job-performance credits given back to clients — subsidized by technician performance, donor grants, the community, and company profits.</div>
        </div>

        <div className="kpi-row k4">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val" style={{ fontSize: k.big ? undefined : "1.5rem" }}>{k.val}</div></div>)}
        </div>

        {approved.length > 0 && (
          <div className="panel pcp-sources">
            <div className="pcp-sources-hd">Given back by source</div>
            <div className="pcp-source-bars">
              {SOURCES.concat([["unattributed", "Unattributed"]]).filter(([k]) => bySource[k]).map(([k, label]) => {
                const amt = bySource[k] || 0;
                const pct = totalGiven ? Math.round(amt / totalGiven * 100) : 0;
                return (
                  <div key={k} className="pcp-source">
                    <div className="pcp-source-top"><span className="pcp-source-dot" style={{ background: SOURCE_COLOR[k] || "#8a94ad" }} />{label}<b>{money0(amt)}</b></div>
                    <div className="pcp-source-track"><div className="pcp-source-fill" style={{ width: pct + "%", background: SOURCE_COLOR[k] || "#8a94ad" }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="sec-head">
          <div className="filters">
            {[["all", `All (${credits.length})`], ["pending", `Pending (${pendingC.length})`], ["approved", `Approved (${approved.length})`]].map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl}</button>
            ))}
          </div>
        </div>

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">No PCP credits in this view.</div> : (
            <table className="dtable">
              <thead><tr><th>Project</th><th className="num">Subtotal</th><th className="num">%</th><th className="num">Credit</th><th>Agreement</th><th>Source</th><th>Status</th></tr></thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.accessId}>
                    <td>
                      <Link className="idlink" href={`/project/${c.accessId}`}>{c.customer}</Link>
                      {c.stage && <div style={{ fontSize: ".74rem", color: "var(--muted)" }}>{c.stage.replace(/_/g, " ")}</div>}
                    </td>
                    <td className="num">{money0(c.subtotal)}</td>
                    <td className="num">{c.pct != null ? c.pct + "%" : "—"}</td>
                    <td className="num" style={{ fontWeight: 800, color: "#1c8a45" }}>{money(c.amount)}</td>
                    <td>
                      {c.agreedAt
                        ? <span title={`Agreed ${fmt(c.agreedAt)}`} style={{ color: "#1c8a45", fontWeight: 700, fontSize: ".8rem" }}>✓ {c.agreementNo || "Agreed"}</span>
                        : <span style={{ color: "var(--muted)", fontSize: ".8rem" }}>Not signed</span>}
                    </td>
                    <td>
                      <select className="usel pcp-src-sel" value={c.grantSource || ""} disabled={pending}
                              onChange={(e) => patch(c.accessId, { grantSource: e.target.value })}
                              style={{ borderLeft: `3px solid ${SOURCE_COLOR[c.grantSource] || "var(--line)"}` }}>
                        <option value="">— Source —</option>
                        {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      {c.status === "approved" ? (
                        <button className="pcp-status-btn approved" disabled={pending} title={`Approved ${fmt(c.approvedAt)} — click to set pending`} onClick={() => patch(c.accessId, { status: "pending" })}>✓ Approved</button>
                      ) : (
                        <button className="pcp-status-btn pending" disabled={pending} title="Finalize this credit" onClick={() => patch(c.accessId, { status: "approved" })}>Approve</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .apx .pcp-sources{padding:16px 18px;margin-bottom:14px}
        .apx .pcp-sources-hd{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--ink);margin-bottom:12px}
        .apx .pcp-source-bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
        .apx .pcp-source-top{display:flex;align-items:center;gap:7px;font-size:.82rem;font-weight:600;color:var(--ink);margin-bottom:5px}
        .apx .pcp-source-top b{margin-left:auto;font-weight:800}
        .apx .pcp-source-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
        .apx .pcp-source-track{height:7px;border-radius:100px;background:var(--bg-soft);overflow:hidden}
        .apx .pcp-source-fill{height:100%;border-radius:100px}
        .apx .pcp-src-sel{padding:5px 8px;font-size:.8rem;border-radius:7px}
        .apx .pcp-status-btn{padding:5px 12px;border-radius:7px;font-family:inherit;font-size:.76rem;font-weight:800;cursor:pointer;border:1px solid}
        .apx .pcp-status-btn.pending{background:#faf0da;border-color:#e5cf95;color:#7a4f00}
        .apx .pcp-status-btn.pending:hover{background:#1c8a45;border-color:#1c8a45;color:#fff}
        .apx .pcp-status-btn.approved{background:#1c8a45;border-color:#1c8a45;color:#fff}
        .apx .pcp-status-btn:disabled{opacity:.5;cursor:default}
      `}</style>
    </AdminShell>
  );
}
