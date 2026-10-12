import { svcIsOpen } from "../../lib/svc-status";
import { redirect } from "next/navigation";
import { getAllJobs, getActivityLog, getAllUsers, getTickets, listServiceCalls, listAdtApplications, getReceivables, allScheduleBlobs } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import AdminClient from "./admin-client";

// The dashboard answers ONE question: what needs my attention right now? It is the admin/manager
// command center — never a navigation page. Other roles land on their own home.
const ROLE_HOME = { tech: "/tech", sales: "/sales", customer: "/login" };

const CLOSED = new Set(["payment", "completion"]);
const DONE   = new Set(["completion"]);
const URGENT_RE = /offline|down|not\s+(working|record)|no\s+signal|dead|fail/i;

// What the owner does next at each lifecycle stage — drives the projects table + Needs Attention copy.
const NEXT_ACTION = {
  inquiry:          "Start survey",
  site_survey:      "Complete survey",
  proposal:         "Awaiting signature",
  approval_deposit: "Collect deposit",
  schedule:         "Schedule install",
  install:          "Finish install",
  qc:               "QC review",
  payment:          "Collect payment",
  completion:       "Complete",
  adt_applied:      "Review application",
  adt_scheduled:    "Install",
  adt_completed:    "Complete",
};
// Six-stage pipeline the dashboard strip + Pipeline KPI count: which lifecycle stages fold into each bucket.
const PIPELINE = [
  { key: "inquiry",  label: "Inquiry",  stages: ["inquiry"],                  filter: "inquiry" },
  { key: "survey",   label: "Survey",   stages: ["site_survey"],              filter: "survey" },
  { key: "proposal", label: "Proposal", stages: ["proposal"],                 filter: "proposal" },
  { key: "approved", label: "Approved", stages: ["approval_deposit"],         filter: "approved" },
  { key: "install",  label: "Install",  stages: ["schedule", "install"],      filter: "install" },
  { key: "closeout", label: "Closeout", stages: ["qc", "payment"],            filter: "closeout" },
];

function todayISO() {
  const d = new Date();   // server is pinned to America/New_York, so local is Eastern
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const user   = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect(ROLE_HOME[user.role] || "/login");
  const alerts = getNotifSummary(user.id);

  const jobs    = getAllJobs();
  const log     = getActivityLog(40);

  const openJobs = jobs.filter((j) => !CLOSED.has(j.stage));

  // ---- Receivables (outstanding balance + overdue count) ----
  const recv = getReceivables();
  const owed = recv.filter((r) => (+r.balance || 0) > 0);
  const receivablesTotal = owed.reduce((s, r) => s + (+r.balance || 0), 0);
  const overdueRecv = owed.filter((r) => (+r.daysOut || 0) >= 30);

  // ---- Tickets + service calls ----
  const openTickets = getTickets().filter((t) => t.status !== "closed" && t.status !== "resolved");
  const urgentTickets = openTickets.filter((t) => t.priority === "urgent");
  const openSvc = listServiceCalls().filter((c) => svcIsOpen(c.stage));
  const urgentSvc = openSvc.filter((c) => ["urgent", "high"].includes(c.priority));

  // ---- Pipeline counts + value ----
  const stageOf = (j) => j.stage;
  const pipeline = PIPELINE.map((p) => ({ ...p, count: jobs.filter((j) => p.stages.includes(stageOf(j))).length }));
  const pipelineOpportunities = jobs.filter((j) => ["inquiry", "site_survey", "proposal", "approval_deposit"].includes(j.stage));
  const pipelineValue = pipelineOpportunities.reduce((s, j) => s + (+j.value || 0), 0);
  const awaitingSignature = jobs.filter((j) => j.stage === "proposal");
  const activeProjects = jobs.filter((j) => ["schedule", "install", "qc"].includes(j.stage));

  // ---- Today's schedule (from each project's scheduling blob) ----
  const custById = Object.fromEntries(jobs.map((j) => [j.access_id, j.customer]));
  const tISO = todayISO();
  const todayAppts = [];
  for (const row of allScheduleBlobs()) {
    let evs = [];
    try { evs = (JSON.parse(row.data || "{}").events) || []; } catch { /* bad blob */ }
    for (const ev of evs) {
      if (!ev || ev.date !== tISO) continue;
      todayAppts.push({
        time: ev.time || "",
        title: ev.title || "Visit",
        customer: custById[row.project_access_id] || "",
        href: `/project/${row.project_access_id}`,
      });
    }
  }
  todayAppts.sort((a, b) => a.time.localeCompare(b.time));
  const installsToday = todayAppts.filter((a) => /install/i.test(a.title)).length;

  // ---- Needs Attention — one cross-module queue of things blocking progress ----
  const na = [];
  const ageDays = (ts) => { if (!ts) return null; const t = new Date((ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")).getTime(); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null; };
  const push = (sev, reason, label, href, age) => na.push({ sev, reason, label, href, age });
  for (const r of overdueRecv) push(3, `Payment overdue · $${Math.round(r.balance).toLocaleString()}`, r.customer || r.contact_name || "Project", `/project/${r.access_id}`, r.daysOut);
  for (const t of urgentTickets) push(3, "Urgent ticket", t.subject || t.project_customer || "Ticket", `/tickets/${t.id}`, ageDays(t.created_at));
  for (const c of urgentSvc) push(3, "Service call", c.customer || c.business_name || "Service call", `/service-calls/${c.id}`, ageDays(c.created_at));
  for (const j of awaitingSignature) push(2, "Awaiting signature", j.customer, `/project/${j.access_id}`, ageDays(j.created_at));
  for (const j of jobs.filter((x) => ["schedule", "install"].includes(x.stage) && (!x.tech || !x.tech.trim()))) push(2, "Needs technician", j.customer, `/project/${j.access_id}`, ageDays(j.created_at));
  for (const j of jobs.filter((x) => x.stage === "site_survey")) push(1, "Survey incomplete", j.customer, `/project/${j.access_id}`, ageDays(j.created_at));
  for (const j of jobs.filter((x) => x.stage === "qc")) push(1, "QC review", j.customer, `/project/${j.access_id}`, ageDays(j.created_at));
  na.sort((a, b) => b.sev - a.sev || (b.age || 0) - (a.age || 0));
  const needsAttention = na.slice(0, 8);

  const kpis = {
    needsAttention: na.length,
    awaitingSignature: awaitingSignature.length,
    pipelineCount: pipelineOpportunities.length,
    pipelineValue,
    activeCount: activeProjects.length,
    installsToday,
    receivablesTotal,
    overdueCount: overdueRecv.length,
  };

  // ---- Recent projects (operational table: what / where / who / next) ----
  const ADT_STAGE = { applied: "adt_applied", scheduled: "adt_scheduled", completed: "adt_completed" };
  const jobRows = jobs.map((j) => ({
    access_id: j.access_id,
    customer: j.customer,
    service: j.service || j.service_code,
    stage: j.stage,
    tech: j.tech || null,
    project_type: j.project_type,
    next: NEXT_ACTION[j.stage] || "—",
    closed: CLOSED.has(j.stage),
    created_at: j.created_at || "",
  }));
  const adtRows = listAdtApplications().map((a) => ({
    kind: "adt",
    access_id: a.adt_id,
    customer: a.name || "ADT account",
    service: (a.property_type === "commercial" ? "Commercial" : "Residential") + " · ADT Monitoring",
    stage: ADT_STAGE[a.stage] || "adt_applied",
    status: a.status || "submitted",
    tech: null,
    next: NEXT_ACTION[ADT_STAGE[a.stage]] || "—",
    closed: a.stage === "completed",
    created_at: a.created_at || "",
  }));
  const projects = [...jobRows, ...adtRows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  // ---- Activity (compact recent feed) ----
  const activity = log.slice(0, 7).map((e) => {
    const who  = e.user_name || "System";
    const proj = e.project_customer || e.project_access_id || null;
    let icon = "blue", title = "";
    if (e.event_type === "login")       { icon = "blue";  title = `${who} signed in`; }
    else if (e.event_type === "logout") { icon = "amber"; title = `${who} signed out`; }
    else if (e.event_type === "pin_access") { icon = "gold"; title = e.notes || `PIN access${proj ? ` — ${proj}` : ""}`; }
    else if (e.event_type === "demo")   { icon = "green"; title = `New inquiry${proj ? ` — ${proj}` : ""}`; }
    else { icon = "gold"; title = e.notes || e.event_type; }
    return { icon, title, when: e.login_at, role: e.user_role || null };
  });

  return (
    <AdminClient
      user={user}
      alerts={alerts}
      kpis={kpis}
      needsAttention={needsAttention}
      pipeline={pipeline}
      projects={projects}
      today={todayAppts}
      activity={activity}
    />
  );
}
