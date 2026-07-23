"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

const STAGE_PILL = {
  inquiry:          { cls: "s-survey",   label: "Inquiry" },
  site_survey:      { cls: "s-survey",   label: "Survey" },
  proposal:         { cls: "s-proposal", label: "Proposal" },
  approval_deposit: { cls: "s-proposal", label: "Approval" },
  schedule:         { cls: "s-install",  label: "Schedule" },
  install:          { cls: "s-install",  label: "Install" },
  qc:               { cls: "s-qc",       label: "QC" },
  payment:          { cls: "s-qc",       label: "Payment" },
  completion:       { cls: "s-done",     label: "Completed" },
};

const money = (n) => "$" + (n || 0).toLocaleString();
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
// Whole days since a ticket was opened — the age the office cares about for SLA.
function daysOpen(ts) {
  if (!ts) return null;
  const then = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  if (isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}
function openLabel(d) {
  if (d == null) return null;
  if (d === 0) return "opened today";
  return `open ${d} day${d === 1 ? "" : "s"}`;
}

export default function AdminClient({ user, alerts, kpis, projects, tickets, technicians, payroll, activity, customers }) {
  const [now, setNow]     = useState("");
  const [greet, setGreet] = useState("Welcome");
  const [pTab, setPTab]   = useState("active");
  const [cTab, setCTab]   = useState("all");
  const first = (user.name || "Admin").trim().split(/\s+/)[0];

  useEffect(() => {
    function tick() {
      const d = new Date(), h = d.getHours();
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      let hr = h % 12 || 12, mm = d.getMinutes();
      setNow(`${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${hr}:${mm < 10 ? "0" : ""}${mm} ${h >= 12 ? "PM" : "AM"}`);
      setGreet(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const visibleProjects = projects
    .filter((p) => pTab === "all" ? true : pTab === "active" ? !p.closed : p.needsAction)
    .slice(0, 8);
  const visibleCustomers = customers
    .filter((c) => cTab === "all" ? true : cTab === "active" ? c.active > 0 : c.total === 1)
    .slice(0, 8);

  const money = (n) => "$" + (n || 0).toLocaleString();
  const KPI = [
    { cls: "c-blue",   label: "New Inquiries",      val: kpis.newInquiries,      sub: <>in the pipeline</>,        href: "/projects?filter=inquiry" },
    { cls: "c-gold",   label: "Open Projects",      val: kpis.openProjects,      sub: <><b>+{kpis.newThisWeek}</b> this week</>, href: "/projects?filter=active" },
    { cls: "c-amber",  label: "Awaiting Signature", val: kpis.awaitingSignature, sub: <>proposal &amp; approval</>, href: "/projects?filter=needs" },
    { cls: "c-purple", label: "Open Service Calls", val: kpis.openServiceCalls,  sub: <><b>{kpis.urgentCalls}</b> urgent</>, href: "/service-calls" },
    { cls: "c-red",    label: "Open Tickets",       val: kpis.openTickets,       sub: <><b>{kpis.urgentTickets}</b> urgent</>, href: "/tickets" },
    { cls: "c-green",  label: "Inventory",          val: kpis.invUnits,          sub: <><b>{money(kpis.invValue)}</b> on hand</>, href: "/inventory" },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="dashboard">
      <section className="welcome">
        <div className="apx-wrap">
          <h1 className="display">{greet}, <em>{first}</em>.</h1>
          <div className="w-sub">{now}</div>
        </div>
      </section>

      <div className="apx-wrap">
        <div className="kpi-row">
          {KPI.map((k) => {
            const inner = (<><div className="k-label">{k.label}</div><div className="k-val">{k.val}</div><div className="k-sub">{k.sub}</div></>);
            return k.href
              ? <Link key={k.label} className={`kpi ${k.cls} kpi-link`} href={k.href}>{inner}</Link>
              : <div key={k.label} className={`kpi ${k.cls}`}>{inner}</div>;
          })}
        </div>

        <div className="actions">
          <Link className="action a-blue" href="/projects"><span className="ic"><svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2M9 12h6M9 16h4"/></svg></span><h3>Work Orders</h3></Link>
          <Link className="action a-gold" href="/customers"><span className="ic"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><h3>Customers</h3></Link>
          <Link className="action a-red" href="/tickets"><span className="ic"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></svg></span><h3>Tickets</h3></Link>
          <Link className="action a-gold" href="/activity"><span className="ic"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span><h3>Activity Log</h3></Link>
        </div>

        <div className="two-col">
          <div className="panel" id="projects">
            <div className="panel-head">
              <h3>Projects</h3>
              <div className="ph-right">
                <div className="tab-row">
                  {[["active","Active"],["all","All"],["needs","Needs Action"]].map(([k, lbl]) => (
                    <button key={k} className={pTab === k ? "on" : ""} onClick={() => setPTab(k)}>{lbl}</button>
                  ))}
                </div>
                <Link className="more" href="/projects">View all →</Link>
              </div>
            </div>
            <div className="pt-row head-row">
              <div className="col-lbl">Project</div><div className="col-lbl">Stage</div><div className="col-lbl">Tech</div><div></div>
            </div>
            {visibleProjects.length === 0 ? (
              <div className="empty">No projects in this view.</div>
            ) : visibleProjects.map((p) => {
              const pill = STAGE_PILL[p.stage] || { cls: "s-survey", label: p.stage };
              return (
                <div className="pt-row" key={p.access_id}>
                  <div><div className="r-name">{p.customer}</div><div className="r-loc">{p.service}{p.address ? ` · ${p.address}` : ""}</div></div>
                  <div><span className={`stage-pill ${pill.cls}`}>{pill.label}</span></div>
                  <div className="r-tech">{p.tech || "—"}</div>
                  <div className="r-open"><Link href={`/project/${p.access_id}`}>Open</Link></div>
                </div>
              );
            })}
          </div>

          <div className="panel" id="tickets">
            <div className="panel-head"><h3>Tickets</h3><Link className="more" href="/tickets">All →</Link></div>
            {tickets.length === 0 ? (
              <div className="empty">No open tickets.</div>
            ) : tickets.map((t) => (
              <Link className="ticket" key={t.id} href={`/tickets/${t.id}`}>
                <span className={`t-dot ${t.priority}`} />
                <div className="t-body">
                  <div className="t-title">{t.title}</div>
                  <div className="t-meta">
                    {t.customer}
                    {(() => { const d = daysOpen(t.opened); return d == null ? null : <> · <span style={d >= 7 ? { color: "var(--red)", fontWeight: 700 } : undefined}>{openLabel(d)}</span></>; })()}
                  </div>
                </div>
                <span className={`tbadge ${t.priority}`}>{t.priority[0].toUpperCase() + t.priority.slice(1)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="three-col">
          <div className="panel">
            <div className="panel-head"><h3>Technicians</h3><Link className="more" href="/users">Manage →</Link></div>
            {technicians.length === 0 ? (
              <div className="empty">No technicians yet.</div>
            ) : technicians.map((t) => (
              <div className="tech-row" key={t.name}>
                <span className="tech-av" style={{ background: t.color.bg, color: t.color.fg }}>{t.initial}</span>
                <div className="t-info"><div className="t-name">{t.name}</div><div className="t-role">{t.role}</div></div>
                <span className="t-jobs">{t.jobs} job{t.jobs === 1 ? "" : "s"}</span>
                <span className={`sdot ${t.status}`}>{t.status === "field" ? "Field" : "Office"}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Payroll</h3><div className="ph-right"><span style={{ fontSize: ".78rem", color: "var(--muted)" }}>Est.</span></div></div>
            {payroll.length === 0 ? (
              <div className="empty">No payroll data.</div>
            ) : payroll.map((p) => (
              <div className="pr-row" key={p.id}>
                <div className="pr-name">{p.name}<span className="pr-id">#{p.id}</span></div>
                <div className="pr-val">{money(p.gross)}</div>
                <div className="pr-bonus">{p.bonus > 0 ? `+${money(p.bonus)}` : "—"}</div>
                <div><span className={`pay-badge ${p.status}`}>{p.status === "paid" ? "Paid" : "Pending"}</span></div>
              </div>
            ))}
            <div style={{ padding: "9px 18px", fontSize: ".7rem", color: "var(--muted)", borderTop: "1px solid var(--line)" }}>Estimated from project value — pending payroll module.</div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Activity Log</h3><Link className="more" href="/activity">Full log →</Link></div>
            {activity.length === 0 ? (
              <div className="empty">No recent activity.</div>
            ) : activity.map((a, i) => (
              <div className="act-row" key={i}>
                <span className={`act-ic ${a.icon}`}><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>
                <div className="act-body"><div className="a-title">{a.title}</div><div className="a-time">{relTime(a.when)}{a.role ? ` · ${a.role}` : ""}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel mb">
          <div className="panel-head">
            <h3>Recent Customers</h3>
            <div className="ph-right">
              <div className="filters">
                {[["all","All"],["active","Active"],["new","New"]].map(([k, lbl]) => (
                  <button key={k} className={cTab === k ? "on" : ""} onClick={() => setCTab(k)}>{lbl}</button>
                ))}
              </div>
              <Link className="more" href="/customers">All customers →</Link>
            </div>
          </div>
          {visibleCustomers.length === 0 ? (
            <div className="empty">No customers in this view.</div>
          ) : visibleCustomers.map((c) => (
            <Link className="crow" key={c.name} href={`/customers/${c.slug}`}>
              <span className="cav">{c.initials}</span>
              <div className="c-main"><div className="c-name">{c.name}</div><div className="c-addr">{c.address || "—"}</div></div>
              <div className="c-chips"><span className="chip">{c.total} project{c.total === 1 ? "" : "s"}</span>{c.active > 0 && <span className="chip active">{c.active} active</span>}</div>
              <span className="c-arr">→</span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
