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

export default function PortalClient({ user, alerts, jobs, customers, tickets = [], serviceCalls = [], initialQ = "" }) {
  const [mode, setMode]         = useState(initialQ ? "projects" : "customer");
  const [query, setQuery]       = useState(initialQ);
  const [customer, setCustomer] = useState(null);
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");

  const custResults = q ? customers.filter((c) => c.toLowerCase().includes(q)) : customers;
  const mine = customer ? jobs.filter((j) => j.customer === customer) : [];

  const projectResults = q
    ? jobs.filter((j) =>
        j.customer.toLowerCase().includes(q) ||
        j.access_id.toLowerCase().includes(q) ||
        j.address?.toLowerCase().includes(q) ||
        j.issue?.toLowerCase().includes(q) ||
        (j.contact_email || "").toLowerCase().includes(q) ||
        (digits.length >= 3 && (j.contact_phone || "").replace(/\D/g, "").includes(digits)))
    : jobs;
  // Cross-entity matches (shown in the All Projects / search view when a query is active).
  const ticketResults = q ? tickets.filter((t) => (t.subject || "").toLowerCase().includes(q) || (t.customer || "").toLowerCase().includes(q)) : [];
  const svcResults = q ? serviceCalls.filter((c) => (c.customer || "").toLowerCase().includes(q) || (c.address || "").toLowerCase().includes(q) || (digits.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(digits))) : [];

  return (
    <AdminShell user={user} alerts={alerts} active="portal">
      <div className="apx-wrap">
        <div className="page-head">
          <h1>Customer Portal</h1>
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
          <>
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

          {/* Cross-entity results (only while searching) — grouped by type */}
          {q && ticketResults.length > 0 && (
            <div className="panel mb">
              <div className="panel-head"><h3>{ticketResults.length} Ticket{ticketResults.length === 1 ? "" : "s"}</h3><Link className="more" href="/tickets">All →</Link></div>
              {ticketResults.slice(0, 12).map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="pt-row pt-click" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div style={{ minWidth: 0 }}><div className="r-name">{t.subject}</div><div className="r-loc">{t.customer}</div></div>
                  <span className="chip">{t.priority}</span>
                </Link>
              ))}
            </div>
          )}
          {q && svcResults.length > 0 && (
            <div className="panel mb">
              <div className="panel-head"><h3>{svcResults.length} Service Call{svcResults.length === 1 ? "" : "s"}</h3><Link className="more" href="/service-calls">All →</Link></div>
              {svcResults.slice(0, 12).map((c) => (
                <Link key={c.id} href={`/service-calls/${c.id}`} className="pt-row pt-click" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div style={{ minWidth: 0 }}><div className="r-name">{c.customer}</div><div className="r-loc">{c.address || "—"}</div></div>
                  <span className="chip">{c.status}</span>
                </Link>
              ))}
            </div>
          )}
          {q && custResults.length > 0 && (
            <div className="panel mb">
              <div className="panel-head"><h3>{custResults.length} Customer{custResults.length === 1 ? "" : "s"}</h3><Link className="more" href="/customers">All →</Link></div>
              {custResults.slice(0, 12).map((c) => (
                <Link key={c} href={`/customers/${encodeURIComponent(c)}`} className="pt-row pt-click" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="r-name">{c}</div>
                </Link>
              ))}
            </div>
          )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
