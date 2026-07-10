"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import { STATUS, STATUS_TONE, SECTION } from "../../lib/spec";

const money = (n) => "$" + (n || 0).toLocaleString();
const CATEGORIES = ["open", "pending", "upgrade", "service", "completed"];

function ProjectCard({ job }) {
  return (
    <Link href={`/project/${job.access_id}`} className="pcard">
      <div className="pc-top">
        <span className="pc-id">{job.access_id}</span>
        <span className={`chip ${STATUS_TONE[job.status] === "green" ? "done" : STATUS_TONE[job.status] === "blue" ? "active" : ""}`}>{STATUS[job.status] || job.status}</span>
      </div>
      <div className="pc-meta">{job.issue ? job.issue : `${job.cameras || 0} cameras`}{job.address ? ` · ${job.address}` : ""}</div>
      <div className="pc-bot">
        <span className="pc-val">{job.value ? money(job.value) : "—"}</span>
        <span className="pc-stage">{job.stageLabel}{job.date ? ` · ${job.date}` : ""}</span>
      </div>
    </Link>
  );
}

export default function PortalClient({ user, alerts, jobs, customers, initialQ = "" }) {
  const [mode, setMode]         = useState(initialQ ? "projects" : "customer");
  const [query, setQuery]       = useState(initialQ);
  const [customer, setCustomer] = useState(null);
  const q = query.trim().toLowerCase();

  const custResults = q ? customers.filter((c) => c.toLowerCase().includes(q)) : customers;
  const mine = customer ? jobs.filter((j) => j.customer === customer) : [];

  const projectResults = q
    ? jobs.filter((j) =>
        j.customer.toLowerCase().includes(q) ||
        j.access_id.toLowerCase().includes(q) ||
        j.address?.toLowerCase().includes(q) ||
        j.issue?.toLowerCase().includes(q))
    : jobs;

  return (
    <AdminShell user={user} alerts={alerts} active="portal">
      <div className="apx-wrap">
        <div className="page-head">
          <h1>Customer Portal</h1>
          <div className="ph-sub">Look up a customer or search every project on file.</div>
        </div>

        <div className="sec-head">
          <div className="tab-row">
            <button className={mode === "customer" ? "on" : ""} onClick={() => { setMode("customer"); setQuery(""); setCustomer(null); }}>By Customer</button>
            <button className={mode === "projects" ? "on" : ""} onClick={() => { setMode("projects"); setCustomer(null); }}>All Projects</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            className="apx-input"
            placeholder={mode === "customer" ? "Search customer…" : "Search projects, addresses, work orders…"}
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (mode === "customer") setCustomer(null); }}
          />
        </div>

        {mode === "customer" && (
          <>
            {custResults.length > 0 && (
              <div className="chip-row" style={{ marginBottom: 18 }}>
                {custResults.map((c) => (
                  <button key={c} className={`pchip${customer === c ? " sel" : ""}`} onClick={() => setCustomer(c)}>{c}</button>
                ))}
              </div>
            )}
            {q && custResults.length === 0 && <div className="empty">No customers match &ldquo;{query}&rdquo;.</div>}

            {!customer && <div className="empty" style={{ marginTop: 8 }}>Select a customer above to view their projects.</div>}
            {customer && mine.length === 0 && <div className="empty">No projects on file for {customer}.</div>}

            {customer && CATEGORIES.map((cat) => {
              const items = mine.filter((j) => j.category === cat);
              if (!items.length) return null;
              return (
                <div className="panel mb" key={cat}>
                  <div className="panel-head"><h3>{SECTION[cat] || cat}</h3><span className="chip">{items.length}</span></div>
                  <div className="pcard-grid">
                    {items.map((j) => <ProjectCard key={j.access_id} job={j} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {mode === "projects" && (
          <div className="panel mb">
            <div className="panel-head"><h3>{projectResults.length} Project{projectResults.length === 1 ? "" : "s"}</h3></div>
            {projectResults.length === 0 ? (
              <div className="empty">No projects match &ldquo;{query}&rdquo;.</div>
            ) : (
              <table className="dtable">
                <thead><tr><th>Project ID</th><th>Customer</th><th>Address</th><th>Stage</th><th>Status</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {projectResults.map((j) => (
                    <tr key={j.access_id}>
                      <td><Link href={`/project/${j.access_id}`} className="mono idlink">{j.access_id}</Link></td>
                      <td className="name-cell">{j.customer}</td>
                      <td style={{ color: "var(--muted)" }}>{j.address || "—"}</td>
                      <td>{j.stageLabel}</td>
                      <td><span className={`chip ${STATUS_TONE[j.status] === "green" ? "done" : STATUS_TONE[j.status] === "blue" ? "active" : ""}`}>{STATUS[j.status] || j.status}</span></td>
                      <td className="num">{j.value ? money(j.value) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
