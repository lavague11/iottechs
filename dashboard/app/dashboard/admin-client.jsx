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
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1d" : `${d}d`;
}
function ageLabel(d) { return d == null ? "" : d === 0 ? "today" : `${d}d`; }
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return t;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function dayLabel(iso) {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function AdminClient({ user, alerts, kpis, recentProjects, needsAttention, today, upcoming, activity }) {
  const [now, setNow]     = useState("");
  const [greet, setGreet] = useState("Welcome");
  const first = (user.name || "Admin").trim().split(/\s+/)[0];

  useEffect(() => {
    function tick() {
      const d = new Date(), h = d.getHours();
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      setNow(`${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`);
      setGreet(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const KPI = [
    { cls: "c-red",   label: "Needs Attention", val: kpis.needsAttention, sub: <><b>{kpis.awaitingSignature}</b> awaiting signature</>, href: "/operations" },
    { cls: "c-gold",  label: "Active Projects", val: kpis.activeCount,     sub: <><b>{kpis.scheduledCount}</b> scheduled</>,            href: "/projects?filter=active" },
    { cls: "c-green", label: "Receivables",     val: money(kpis.receivablesTotal), sub: <><b>{kpis.overdueCount}</b> overdue</>,        href: "/receivables" },
  ];
  const sevCls = (s) => (s >= 3 ? "sev-hi" : s === 2 ? "sev-md" : "sev-lo");
  const scheduleItems = (today && today.length) ? today : upcoming;
  const scheduleLabel = (today && today.length) ? "Today" : (upcoming && upcoming.length) ? "Upcoming" : "Today";

  return (
    <AdminShell user={user} alerts={alerts} active="dashboard">
      <section className="welcome">
        <div className="apx-wrap">
          <h1 className="display">{greet}, <em>{first}</em>.</h1>
          <div className="w-sub">{now}</div>
        </div>
      </section>

      <div className="apx-wrap">
        {/* Recent Projects — the launchpad: get straight back into what you were working on */}
        <div className="sec-head"><h2>Recent Projects</h2><Link className="more" href="/projects">View all →</Link></div>
        {recentProjects.length === 0 ? (
          <div className="panel"><div className="empty">No projects opened yet — open one and it&rsquo;ll show here for quick re-entry.</div></div>
        ) : (
          <div className="rp-grid">
            {recentProjects.map((p) => {
              const pill = STAGE_PILL[p.stage] || { cls: "s-survey", label: p.stageLabel || p.stage };
              return (
                <Link className="rp-card" key={p.access_id} href={`/project/${p.access_id}`}>
                  <div className="rp-name">{p.customer}</div>
                  <div className="rp-id mono">{p.access_id}{p.service ? <span className="rp-svc"> · {p.service}</span> : null}</div>
                  <div className="rp-foot">
                    <span className={`stage-pill ${pill.cls}`}>{pill.label}</span>
                    <span className="rp-next">{p.next}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Three health numbers */}
        <div className="kpi-row k3">
          {KPI.map((k) => (
            <Link key={k.label} className={`kpi ${k.cls} kpi-link`} href={k.href}>
              <div className="k-label">{k.label}</div>
              <div className="k-val">{k.val}</div>
              <div className="k-sub">{k.sub}</div>
            </Link>
          ))}
        </div>

        {/* Needs Attention — top 5 of the canonical Action Center */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Needs Attention {kpis.needsAttention > 0 && <span className="na-count">{kpis.needsAttention}</span>}</h3>
            <Link className="more" href="/operations">View all →</Link>
          </div>
          {needsAttention.length === 0 ? (
            <div className="empty">Nothing needs attention. You&rsquo;re clear.</div>
          ) : needsAttention.map((n, i) => (
            <Link className="na-row" key={i} href={n.href}>
              <span className={`na-dot ${sevCls(n.sev)}`} />
              <div className="na-body"><div className="na-label">{n.label}</div><div className="na-reason">{n.reason}</div></div>
              {n.age != null && <span className="na-age">{ageLabel(n.age)}</span>}
              <span className="na-arr">→</span>
            </Link>
          ))}
        </div>

        {/* Today / Upcoming — collapses to a single row when empty */}
        {scheduleItems && scheduleItems.length > 0 ? (
          <div className="panel mb">
            <div className="panel-head"><h3>{scheduleLabel}</h3><Link className="more" href="/projects">Schedule →</Link></div>
            {scheduleItems.map((t, i) => (
              <Link className="today-row" key={i} href={t.href}>
                <span className="today-time">{scheduleLabel === "Upcoming" ? dayLabel(t.date) : fmtTime(t.time)}</span>
                <div className="today-body"><div className="today-title">{t.title}</div>{t.customer && <div className="today-cust">{t.customer}</div>}</div>
                {scheduleLabel === "Upcoming" && t.time && <span className="today-at">{fmtTime(t.time)}</span>}
              </Link>
            ))}
          </div>
        ) : (
          <Link className="sched-empty" href="/projects">
            <span className="se-lbl">Today</span>
            <span className="se-msg">Nothing scheduled.</span>
            <span className="se-more">Schedule →</span>
          </Link>
        )}

        {/* Recent business activity */}
        <div className="panel mb">
          <div className="panel-head"><h3>Recent Activity</h3><Link className="more" href="/activity">Full log →</Link></div>
          {activity.length === 0 ? (
            <div className="empty">No recent activity.</div>
          ) : activity.map((a, i) => {
            const inner = (
              <>
                <span className={`act-ic ${a.icon}`}><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>
                <div className="act-body"><div className="a-title">{a.title}</div><div className="a-time">{a.customer ? `${a.customer} · ` : ""}{relTime(a.when)}</div></div>
              </>
            );
            return a.href
              ? <Link className="act-row act-click" key={i} href={a.href}>{inner}</Link>
              : <div className="act-row" key={i}>{inner}</div>;
          })}
        </div>
      </div>
    </AdminShell>
  );
}
