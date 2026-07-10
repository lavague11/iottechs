"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";

function relTime(ts) {
  if (!ts) return "";
  const then = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  if (isNaN(then)) return ts;
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}
const STATUS_LABEL = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };

export default function TicketsClient({ user, alerts, tickets }) {
  const [filter, setFilter] = useState("open");
  const [query, setQuery]   = useState("");
  const router = useRouter();
  const q = query.trim().toLowerCase();

  const open = tickets.filter((t) => t.status !== "closed" && t.status !== "resolved");
  const visible = tickets
    .filter((t) =>
      filter === "all" ? true :
      filter === "open" ? (t.status !== "closed" && t.status !== "resolved") :
      filter === "closed" ? (t.status === "closed" || t.status === "resolved") :
      t.priority === filter && t.status !== "closed")
    .filter((t) => !q || t.subject.toLowerCase().includes(q) || (t.customer || "").toLowerCase().includes(q));

  const KPI = [
    { cls: "c-red",    label: "Open Tickets", val: open.length },
    { cls: "c-amber",  label: "Urgent",       val: open.filter((t) => t.priority === "urgent").length },
    { cls: "c-purple", label: "In Progress",  val: tickets.filter((t) => t.status === "in_progress").length },
    { cls: "c-green",  label: "Closed",       val: tickets.filter((t) => t.status === "closed" || t.status === "resolved").length },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="tickets">
      <div className="apx-wrap">
        <div className="page-head"><h1>Tickets</h1><div className="ph-sub">Service issues &amp; requests · click a ticket to manage it</div></div>

        <div className="kpi-row k4">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val">{k.val}</div></div>)}
        </div>

        <div className="sec-head">
          <div className="filters">
            {[["open", "Open"], ["urgent", "Urgent"], ["medium", "Medium"], ["low", "Low"], ["closed", "Closed"], ["all", "All"]].map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl}</button>
            ))}
          </div>
          <input className="apx-input" style={{ maxWidth: 300 }} placeholder="Search tickets…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">No tickets in this view.</div> : (
            <table className="dtable">
              <thead><tr><th>Subject</th><th>Customer</th><th>Opened by</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {visible.map((t) => {
                  const closed = t.status === "closed" || t.status === "resolved";
                  return (
                    <tr key={t.id} style={{ cursor: "pointer", ...(closed ? { opacity: .6 } : {}) }} onClick={() => router.push(`/tickets/${t.id}`)}>
                      <td><div className="name-cell">{t.subject}</div>{t.message_count > 0 && <div style={{ fontSize: ".74rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{t.message_count}</div>}</td>
                      <td style={{ color: "var(--muted)" }}>{t.customer}</td>
                      <td style={{ color: "var(--muted)", textTransform: "capitalize" }}>{t.opened_by_name || "—"}<div style={{ fontSize: ".72rem" }}>{t.opened_by_role}</div></td>
                      <td style={{ color: "var(--muted)" }}>{t.assignee_name || "Unassigned"}</td>
                      <td><span className={`tbadge ${t.priority}`} style={{ marginLeft: 0 }}>{t.priority[0].toUpperCase() + t.priority.slice(1)}</span></td>
                      <td><span className={`chip ${closed ? "done" : t.status === "in_progress" ? "active" : ""}`}>{STATUS_LABEL[t.status] || t.status}</span></td>
                      <td style={{ color: "var(--muted)", fontSize: ".82rem" }}>{relTime(t.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
