import { redirect } from "next/navigation";
import { getAllJobs, getTickets, listServiceCalls, getReceivables, allScheduleBlobs, getPendingWorkOrders, getPendingExpenses, getPendingRequests, getRecentProjectIdsForUser, getRecentBusinessEvents } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { buildActionItems } from "../../lib/action-center";
import AdminClient from "./admin-client";

// Home is a LAUNCHPAD, not a report: get me back into recent work, show what needs attention, a few
// health numbers, and what's scheduled. Everything else lives in its own module.
const ROLE_HOME = { tech: "/tech", sales: "/sales", customer: "/login" };
const CLOSED = new Set(["payment", "completion"]);

// What the owner does next at each lifecycle stage.
const NEXT_ACTION = {
  inquiry: "Start survey", site_survey: "Complete survey", proposal: "Awaiting signature",
  approval_deposit: "Collect deposit", schedule: "Schedule install", install: "Finish install",
  qc: "QC review", payment: "Collect payment", completion: "Complete",
};

function todayISO() {
  const d = new Date();   // server is pinned to America/New_York, so local is Eastern
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect(ROLE_HOME[user.role] || "/login");
  const alerts = getNotifSummary(user.id);

  const jobs = getAllJobs();

  // ---- Recent Projects — the six THIS user most recently opened (launchpad anchor) ----
  const byId = Object.fromEntries(jobs.map((j) => [j.access_id, j]));
  const recentProjects = getRecentProjectIdsForUser(user.id, 8)
    .map((id) => byId[id]).filter(Boolean).filter((j) => !j.lost_at).slice(0, 6)
    .map((j) => ({
      access_id: j.access_id, customer: j.customer, service: j.service || j.service_code,
      stage: j.stage, stageLabel: j.stageLabel, next: NEXT_ACTION[j.stage] || "—",
      project_type: j.project_type, property_type: j.property_type,
    }));

  // ---- Three health numbers ----
  const recv = getReceivables();
  const owed = recv.filter((r) => (+r.balance || 0) > 0);
  const receivablesTotal = owed.reduce((s, r) => s + (+r.balance || 0), 0);
  const overdueCount = owed.filter((r) => (+r.daysOut || 0) >= 30).length;
  const openTickets = getTickets().filter((t) => t.status !== "closed" && t.status !== "resolved");
  const openSvc = listServiceCalls().filter((c) => !["resolved", "billed", "closed", "paid"].includes(c.stage));
  const awaitingSignature = jobs.filter((j) => j.stage === "proposal").length;
  const activeProjects = jobs.filter((j) => ["schedule", "install", "qc"].includes(j.stage));
  const scheduledCount = jobs.filter((j) => j.stage === "schedule").length;

  // ---- Needs Attention = top slice of the canonical Action Center ----
  const ac = buildActionItems({
    jobs, receivables: recv, tickets: openTickets, serviceCalls: openSvc,
    pendingWorkOrders: getPendingWorkOrders(), pendingExpenses: getPendingExpenses(), pendingRequests: getPendingRequests(),
  });
  const needsAttention = ac.items.slice(0, 5);

  const kpis = {
    needsAttention: ac.count, awaitingSignature,
    activeCount: activeProjects.length, scheduledCount,
    receivablesTotal, overdueCount,
  };

  // ---- Today / Upcoming (from each project's scheduling blob) ----
  const custById = Object.fromEntries(jobs.map((j) => [j.access_id, j.customer]));
  const tISO = todayISO();
  const appts = [];
  for (const row of allScheduleBlobs()) {
    let evs = [];
    try { evs = (JSON.parse(row.data || "{}").events) || []; } catch { /* bad blob */ }
    for (const ev of evs) {
      if (!ev || !ev.date || ev.date < tISO) continue;
      appts.push({ date: ev.date, time: ev.time || "", title: ev.title || "Visit", customer: custById[row.project_access_id] || "", href: `/project/${row.project_access_id}` });
    }
  }
  appts.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const today = appts.filter((a) => a.date === tISO);
  const upcoming = appts.filter((a) => a.date > tISO).slice(0, 4);

  // ---- Recent Activity — meaningful BUSINESS events only (Job Log), never login/PIN audit noise ----
  const activity = getRecentBusinessEvents(6).map((e) => {
    const k = (e.kind || "").toLowerCase(), lbl = (e.label || e.kind || "").toLowerCase();
    let icon = "gold";
    if (/pay/.test(k) || /payment|paid/.test(lbl)) icon = "green";
    else if (/sign|accept|complete|approv|qc/.test(k + lbl)) icon = "green";
    else if (/proposal/.test(k + lbl)) icon = "blue";
    else if (/ticket|issue|fail|flag/.test(k + lbl)) icon = "red";
    else if (/survey|mockup|install|schedul/.test(k + lbl)) icon = "gold";
    return { icon, title: e.label || e.kind, customer: e.project_customer || "", href: e.project_access_id ? `/project/${e.project_access_id}` : null, when: e.created_at };
  });

  return (
    <AdminClient
      user={user}
      alerts={alerts}
      kpis={kpis}
      recentProjects={recentProjects}
      needsAttention={needsAttention}
      today={today}
      upcoming={upcoming}
      activity={activity}
    />
  );
}
