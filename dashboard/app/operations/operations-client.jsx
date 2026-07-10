"use client";

import Link from "next/link";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (n || 0).toLocaleString();

function Section({ title, count, accent, href, viewLabel, empty, children }) {
  return (
    <div className="panel mb">
      <div className="panel-head">
        <h3>{title} {count > 0 && <span className={`op-badge ${accent}`}>{count}</span>}</h3>
        {href && <Link href={href} className="btn btn-ghost btn-sm">{viewLabel || "View all"}</Link>}
      </div>
      {count === 0 ? <div className="op-clear">✓ {empty}</div> : children}
    </div>
  );
}

export default function OperationsClient({ user, alerts, expenses, requests, workOrders, tickets }) {
  const urgentTickets = tickets.filter(t => t.priority === "urgent");
  const totalActions = expenses.length + requests.length + workOrders.length + tickets.length;

  const first = (user.name || "there").split(/\s+/)[0].replace(/\(.*\)/, "").trim();

  const KPI = [
    { cls: "c-amber",  label: "Pending Expenses",   val: expenses.length, big: true },
    { cls: "c-purple", label: "Pending Requests",   val: requests.length, big: true },
    { cls: "c-blue",   label: "Work Orders to Review", val: workOrders.length, big: true },
    { cls: "c-red",    label: "Open Tickets",       val: tickets.length, big: true },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="operations">
      <style>{OP_CSS}</style>
      <div className="apx-wrap">

        <div className="welcome">
          <h1>Action <em>Center</em></h1>
          <p className="op-sub">
            {totalActions === 0
              ? `All clear, ${first}. Nothing is waiting on a decision right now.`
              : `${totalActions} item${totalActions === 1 ? "" : "s"} need a decision, ${first}. Everything operational that's waiting on you, in one place.`}
          </p>
        </div>

        <div className="kpi-row k4">
          {KPI.map((k) => (
            <div key={k.label} className={`kpi ${k.cls}`}>
              <div className="k-label">{k.label}</div>
              <div className="k-val">{k.val}</div>
            </div>
          ))}
        </div>

        {/* Work Orders awaiting review */}
        <Section title="Work Orders to Review" count={workOrders.length} accent="op-blue" empty="No work orders awaiting review.">
          {workOrders.map(w => (
            <div className="op-row" key={w.id}>
              <div className="op-row-main">
                <div className="op-row-name">Project #{w.project_access_id}</div>
                <div className="op-row-sub">{w.submitted_by_name ? `Submitted by ${w.submitted_by_name}` : "Submitted"}{w.notes ? ` · ${w.notes}` : ""}</div>
              </div>
              <Link href={`/project/${w.project_access_id}`} className="op-open">Review →</Link>
            </div>
          ))}
        </Section>

        {/* Pending Requests */}
        <Section title="Equipment / Material Requests" count={requests.length} accent="op-purple" empty="No pending requests.">
          {requests.map(r => (
            <div className="op-row" key={r.id}>
              <div className="op-row-main">
                <div className="op-row-name">{r.request_type || "Request"} — {r.description}</div>
                <div className="op-row-sub">{r.submitted_by_name ? `${r.submitted_by_name} · ` : ""}{r.project_access_id ? `Project #${r.project_access_id}` : "General"}</div>
              </div>
              {r.project_access_id && <Link href={`/project/${r.project_access_id}`} className="op-open">Open →</Link>}
            </div>
          ))}
        </Section>

        {/* Pending Expenses */}
        <Section title="Expenses Awaiting Approval" count={expenses.length} accent="op-amber" href="/expenses" viewLabel="Expenses" empty="No expenses awaiting approval.">
          {expenses.map(e => (
            <div className="op-row" key={e.id}>
              <div className="op-row-main">
                <div className="op-row-name">{e.description} · <b>{money(e.amount)}</b></div>
                <div className="op-row-sub">{[e.category, e.submitted_by_name, e.access_id ? `Project #${e.access_id}` : null].filter(Boolean).join(" · ")}</div>
              </div>
              <Link href="/expenses" className="op-open">Review →</Link>
            </div>
          ))}
        </Section>

        {/* Open Tickets */}
        <Section title="Open Tickets" count={tickets.length} accent="op-red" href="/tickets" viewLabel="All tickets" empty="No open tickets.">
          {urgentTickets.length > 0 && (
            <div className="op-urgent-note">{urgentTickets.length} urgent — handle these first.</div>
          )}
          {tickets.slice(0, 10).map(t => (
            <div className="op-row" key={t.id}>
              <span className={`op-pri op-pri-${t.priority}`}>{t.priority}</span>
              <div className="op-row-main">
                <div className="op-row-name">{t.subject}</div>
                <div className="op-row-sub">{[t.project_customer, t.assignee_name ? `→ ${t.assignee_name}` : "Unassigned"].filter(Boolean).join(" · ")}</div>
              </div>
              <Link href={`/tickets/${t.id}`} className="op-open">Open →</Link>
            </div>
          ))}
        </Section>

      </div>
    </AdminShell>
  );
}

const OP_CSS = `
.apx .op-sub{color:var(--muted);font-size:.92rem;margin-top:4px;max-width:720px}
.apx .op-badge{font-size:.7rem;font-weight:700;padding:2px 9px;border-radius:100px;margin-left:6px;vertical-align:middle}
.apx .op-blue{background:rgba(41,128,185,.1);color:#2471a3}
.apx .op-purple{background:rgba(124,58,237,.1);color:#6d28d9}
.apx .op-amber{background:rgba(224,154,58,.13);color:#8a5f00}
.apx .op-red{background:rgba(231,76,60,.1);color:#c0392b}
.apx .op-clear{padding:18px;color:#1c8a45;font-size:.86rem;font-weight:600}
.apx .op-row{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line)}
.apx .op-row:last-child{border-bottom:none}
.apx .op-row:hover{background:var(--bg-soft)}
.apx .op-row-main{flex:1;min-width:0}
.apx .op-row-name{font-weight:600;font-size:.88rem}
.apx .op-row-sub{font-size:.76rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apx .op-open{font-size:.8rem;font-weight:600;color:var(--accent-primary,#C9A96E);white-space:nowrap;flex-shrink:0}
.apx .op-open:hover{text-decoration:underline}
.apx .op-pri{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:3px 8px;border-radius:6px;flex-shrink:0}
.apx .op-pri-urgent{background:rgba(231,76,60,.12);color:#c0392b}
.apx .op-pri-medium{background:rgba(224,154,58,.13);color:#8a5f00}
.apx .op-pri-low{background:rgba(99,117,155,.1);color:#5a6d8a}
.apx .op-urgent-note{padding:10px 18px;font-size:.8rem;font-weight:600;color:#c0392b;background:rgba(231,76,60,.05);border-bottom:1px solid var(--line)}
`;
