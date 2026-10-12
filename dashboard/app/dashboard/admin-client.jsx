"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import { ProjectTypeIcon } from "../components/project-type";
import { adtStatusMeta } from "../../lib/adt";

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
  adt_applied:      { cls: "s-proposal", label: "Applied" },
  adt_scheduled:    { cls: "s-install",  label: "Scheduled" },
  adt_completed:    { cls: "s-done",     label: "Completed" },
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
function ageLabel(d) {
  if (d == null) return "";
  if (d === 0) return "today";
  return `${d}d`;
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return t;
  const hr = h % 12 || 12;
  return `${hr}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function AdminClient({ user, alerts, kpis, needsAttention, pipeline, projects, today, activity }) {
  const [now, setNow]     = useState("");
  const [greet, setGreet] = useState("Welcome");
  const [pTab, setPTab]   = useState("active");
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
    .filter((p) => pTab === "all" ? true : !p.closed)
    .slice(0, 8);

  // Four action-oriented numbers — each answers "where should I look?".
  const KPI = [
    { cls: "c-red",   label: "Needs Attention", val: kpis.needsAttention, sub: <><b>{kpis.awaitingSignature}</b> awaiting signature</>, href: "/operations" },
    { cls: "c-blue",  label: "Pipeline",        val: kpis.pipelineCount,  sub: <><b>{money(kpis.pipelineValue)}</b> value</>,           href: "/sales" },
    { cls: "c-gold",  label: "Active Projects", val: kpis.activeCount,     sub: <><b>{kpis.installsToday}</b> installs today</>,          href: "/projects?filter=active" },
    { cls: "c-green", label: "Receivables",     val: money(kpis.receivablesTotal), sub: <><b>{kpis.overdueCount}</b> overdue</>,         href: "/receivables" },
  ];

  const sevCls = (s) => (s >= 3 ? "sev-hi" : s === 2 ? "sev-md" : "sev-lo");

  return (
    <AdminShell user={user} alerts={alerts} active="dashboard">
      <section className="welcome">
        <div className="apx-wrap">
          <h1 className="display">{greet}, <em>{first}</em>.</h1>
          <div className="w-sub">{now}</div>
        </div>
      </section>

      <div className="apx-wrap">
        <div className="kpi-row k4">
          {KPI.map((k) => (
            <Link key={k.label} className={`kpi ${k.cls} kpi-link`} href={k.href}>
              <div className="k-label">{k.label}</div>
              <div className="k-val">{k.val}</div>
              <div className="k-sub">{k.sub}</div>
            </Link>
          ))}
        </div>

        {/* Needs Attention — the cross-module queue of things blocking progress */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Needs Attention</h3>
            <Link className="more" href="/operations">Action Center →</Link>
          </div>
          {needsAttention.length === 0 ? (
            <div className="empty">Nothing needs attention. You&rsquo;re clear.</div>
          ) : needsAttention.map((n, i) => (
            <Link className="na-row" key={i} href={n.href}>
              <span className={`na-dot ${sevCls(n.sev)}`} />
              <div className="na-body">
                <div className="na-label">{n.label}</div>
                <div className="na-reason">{n.reason}</div>
              </div>
              {n.age != null && <span className="na-age">{ageLabel(n.age)}</span>}
              <span className="na-arr">→</span>
            </Link>
          ))}
        </div>

        {/* Pipeline snapshot — the six-stage lifecycle, each clickable */}
        <div className="pipe-strip">
          {pipeline.map((p) => (
            <Link key={p.key} className="pipe-seg" href={`/projects?filter=${p.filter}`}>
              <span className="pipe-n">{p.count}</span>
              <span className="pipe-lbl">{p.label}</span>
            </Link>
          ))}
        </div>

        <div className="two-col">
          <div className="panel" id="projects">
            <div className="panel-head">
              <h3>Projects</h3>
              <div className="ph-right">
                <div className="tab-row">
                  {[["active","Active"],["all","All"]].map(([k, lbl]) => (
                    <button key={k} className={pTab === k ? "on" : ""} onClick={() => setPTab(k)}>{lbl}</button>
                  ))}
                </div>
                <Link className="more" href="/projects">View all →</Link>
              </div>
            </div>
            <div className="pt-row head-row pt4">
              <div className="col-lbl">Project</div><div className="col-lbl">Stage</div><div className="col-lbl">Assigned</div><div className="col-lbl">Next</div>
            </div>
            {visibleProjects.length === 0 ? (
              <div className="empty">No projects in this view.</div>
            ) : visibleProjects.map((p) => {
              const pill = STAGE_PILL[p.stage] || { cls: "s-survey", label: p.stage };
              const href = p.kind === "adt" ? `/adt-applications/${p.access_id}` : `/project/${p.access_id}`;
              return (
                <Link className="pt-row pt4 pt-click" key={p.access_id} href={href}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                    <ProjectTypeIcon project={p} />
                    <div style={{ minWidth: 0 }}><div className="r-name">{p.customer}</div><div className="r-loc">{p.service}</div></div>
                  </div>
                  <div>{p.kind === "adt"
                    ? (() => { const m = adtStatusMeta(p.status); return <span className="stage-pill" style={{ background: m.color + "1a", color: m.color }}>{m.label}</span>; })()
                    : <span className={`stage-pill ${pill.cls}`}>{pill.label}</span>}</div>
                  <div className="r-tech">{p.tech || "—"}</div>
                  <div className="r-next">{p.next}</div>
                </Link>
              );
            })}
          </div>

          <div className="panel" id="today">
            <div className="panel-head"><h3>Today</h3><Link className="more" href="/projects">Schedule →</Link></div>
            {today.length === 0 ? (
              <div className="empty">Nothing scheduled today.</div>
            ) : today.map((t, i) => (
              <Link className="today-row" key={i} href={t.href}>
                <span className="today-time">{fmtTime(t.time)}</span>
                <div className="today-body">
                  <div className="today-title">{t.title}</div>
                  {t.customer && <div className="today-cust">{t.customer}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel mb">
          <div className="panel-head"><h3>Activity</h3><Link className="more" href="/activity">Full log →</Link></div>
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
    </AdminShell>
  );
}
