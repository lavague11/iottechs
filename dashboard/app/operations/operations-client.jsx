"use client";

import Link from "next/link";
import AdminShell from "../components/admin-shell";
import EmailTestButton from "./email-test-button";

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

const ageClass = (d) => d == null ? "op-age-grey" : d >= 7 ? "op-age-red" : d >= 3 ? "op-age-amber" : "op-age-grey";

export default function OperationsClient({ user, alerts, expenses, requests, workOrders, tickets, stalled = [] }) {
  const urgentTickets = tickets.filter(t => t.priority === "urgent");
  const totalActions = expenses.length + requests.length + workOrders.length + tickets.length;

  const custWaiting = stalled.filter(j => j.who === "customer").length;
  const usWaiting   = stalled.filter(j => j.who !== "customer").length;
  const staleCount  = stalled.filter(j => (j.age_days ?? 0) >= 7).length;

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
            {stalled.length === 0 && totalActions === 0
              ? `All clear, ${first}. Nothing's stalled and nothing needs a decision right now.`
              : stalled.length > 0
                ? `${first}, ${custWaiting} job${custWaiting === 1 ? "" : "s"} ${custWaiting === 1 ? "is" : "are"} waiting on the customer and ${usWaiting} on your team${staleCount > 0 ? ` — ${staleCount} stalled 7+ days` : ""}. Everything that needs to move, in one place.`
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

        {/* Stalled jobs — the throughput view: every active job's blocker, whose court, how long */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Stalled Jobs {stalled.length > 0 && <span className="op-badge op-red">{stalled.length}</span>}</h3>
          </div>
          {stalled.length === 0 ? (
            <div className="op-clear">Everything's moving — no active jobs are waiting.</div>
          ) : (
            <>
              <div className="op-stall-sum">
                <b>{custWaiting}</b> waiting on the customer · <b>{usWaiting}</b> on our team{staleCount > 0 ? <> · <span className="op-stall-red">{staleCount} stalled 7+ days</span></> : null}
              </div>
              {stalled.slice(0, 20).map(j => (
                <Link href={`/project/${j.access_id}`} className="op-row op-stall-row" key={j.access_id}>
                  <span className={`op-age ${ageClass(j.age_days)}`}>{j.age_days == null ? "—" : `${j.age_days}d`}</span>
                  <div className="op-row-main">
                    <div className="op-row-name">{j.customer} <span className="op-stall-stage">· {j.stageLabel}</span></div>
                    <div className="op-row-sub">{j.blocker}</div>
                  </div>
                  <span className={`op-who ${j.who === "customer" ? "op-who-cust" : "op-who-us"}`}>{j.who === "customer" ? "Waiting on customer" : "On our team"}</span>
                </Link>
              ))}
              {stalled.length > 20 && <div className="op-more">+{stalled.length - 20} more active jobs</div>}
            </>
          )}
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

        {/* System — email delivery diagnostic (admin only) */}
        {user.role === "admin" && <EmailTestButton />}

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
.apx .op-stall-sum{padding:11px 18px;font-size:.82rem;color:var(--muted);border-bottom:1px solid var(--line);background:var(--bg-soft)}
.apx .op-stall-sum b{color:var(--ink)}
.apx .op-stall-red{color:#c0392b;font-weight:700}
.apx .op-stall-row{text-decoration:none;color:inherit}
.apx .op-age{flex-shrink:0;width:42px;text-align:center;font-size:.78rem;font-weight:800;padding:4px 0;border-radius:7px}
.apx .op-age-grey{background:var(--bg-tint);color:#5a6d8a}
.apx .op-age-amber{background:rgba(224,154,58,.14);color:#8a5f00}
.apx .op-age-red{background:rgba(231,76,60,.12);color:#c0392b}
.apx .op-stall-stage{color:var(--muted);font-weight:600}
.apx .op-who{flex-shrink:0;font-size:.7rem;font-weight:700;padding:4px 10px;border-radius:100px;white-space:nowrap}
.apx .op-who-cust{background:rgba(75,106,155,.12);color:#3a5480}
.apx .op-who-us{background:rgba(201,169,110,.16);color:#7a5f1f}
.apx .op-more{padding:11px 18px;font-size:.8rem;color:var(--muted)}
`;
