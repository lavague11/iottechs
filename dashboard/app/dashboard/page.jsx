import { getAllJobs, getCustomersWithStats, getActivityLog, getAllUsers, getInventoryStats, getTickets } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import AdminClient from "./admin-client";

const CLOSED = new Set(["payment", "completion"]);
const URGENT_RE = /offline|down|not\s+(working|record)|no\s+signal|dead|fail/i;

function firstName(name) { return (name || "").trim().split(/\s+/)[0] || ""; }
function initials(name) {
  return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default async function DashboardPage() {
  const user   = await getSessionUser();
  const alerts = getNotifSummary(user.id);

  const jobs     = getAllJobs();
  const custStat = getCustomersWithStats();
  const log      = getActivityLog(40);
  const users    = getAllUsers();

  // ---- KPIs (all derived from live project data) ----
  const openJobs   = jobs.filter((j) => !CLOSED.has(j.stage));
  const ticketJobs = jobs.filter((j) => j.issue && j.issue.trim() && !CLOSED.has(j.stage));
  const weekAgo    = Date.now() - 7 * 24 * 3600 * 1000;
  const newThisWeek = jobs.filter((j) => j.created_at && new Date(j.created_at + "Z").getTime() >= weekAgo).length;
  const inv = getInventoryStats();
  const realTickets = getTickets();
  const openReal = realTickets.filter((t) => t.status !== "closed" && t.status !== "resolved");
  const urgentTickets = openReal.filter((t) => t.priority === "urgent").length;
  const urgentCalls   = openJobs.filter((j) => j.project_type === "C" && j.issue && URGENT_RE.test(j.issue)).length;

  const kpis = {
    newInquiries:      jobs.filter((j) => j.stage === "inquiry").length,
    openProjects:      openJobs.length,
    awaitingSignature: jobs.filter((j) => ["proposal", "approval_deposit"].includes(j.stage)).length,
    openServiceCalls:  openJobs.filter((j) => j.project_type === "C").length,
    openTickets:       openReal.length,
    invUnits:          inv.units,
    invValue:          inv.value,
    invSkus:           inv.skus,
    newThisWeek,
    urgentTickets,
    urgentCalls,
  };

  // ---- Projects (client filters by tab) ----
  const projects = jobs.map((j) => ({
    access_id:    j.access_id,
    customer:     j.customer,
    service:      j.service || j.service_code,
    address:      j.address,
    stage:        j.stage,
    tech:         j.tech || null,
    project_type: j.project_type,
    needsAction:  ["proposal", "approval_deposit", "qc"].includes(j.stage),
    closed:       CLOSED.has(j.stage),
  }));

  // ---- Tickets (from the real tickets table) ----
  const tickets = openReal.slice(0, 8).map((t) => ({
    id:        t.id,
    title:     t.subject,
    customer:  t.project_customer || t.opened_by_name || "—",
    date:      t.updated_at,
    priority:  t.priority,
  }));

  // ---- Technicians (real tech users + live job load) ----
  const TECH_COLORS = [
    { bg: "#e8f0fe", fg: "#3257ff" }, { bg: "#f3eeff", fg: "#7c3aed" },
    { bg: "#e7f6ec", fg: "#1c8a45" }, { bg: "#faf4e8", fg: "#b08f4f" },
  ];
  const techUsers = users.filter((u) => u.role === "tech");
  const jobCountFor = (techName) => {
    const fn = firstName(techName).toLowerCase();
    return jobs.filter((j) => j.tech && firstName(j.tech).toLowerCase() === fn && !CLOSED.has(j.stage)).length;
  };
  const technicians = techUsers.map((u, i) => {
    const load = jobCountFor(u.name);
    return {
      name:    u.name.replace(/\s*\(Tech\)\s*/i, "").trim() || u.name,
      role:    "Technician",
      jobs:    load,
      status:  load > 0 ? "field" : "office",
      initial: initials(u.name)[0] || "T",
      color:   TECH_COLORS[i % TECH_COLORS.length],
    };
  });

  // ---- Payroll (derived from each tech's assigned project value — placeholder commission) ----
  // No payroll subsystem yet; gross is a 10% commission on the tech's project value, bonus 3% of completed.
  const payroll = techUsers.map((u, i) => {
    const fn = firstName(u.name).toLowerCase();
    const mine = jobs.filter((j) => j.tech && firstName(j.tech).toLowerCase() === fn);
    const gross = Math.round(mine.reduce((s, j) => s + (j.value || 0), 0) * 0.10);
    const bonus = Math.round(mine.filter((j) => j.stage === "completion").reduce((s, j) => s + (j.value || 0), 0) * 0.03);
    return {
      name:   u.name.replace(/\s*\(Tech\)\s*/i, "").trim() || u.name,
      id:     String(i + 1).padStart(3, "0"),
      gross,
      bonus,
      status: mine.some((j) => j.stage !== "completion") ? "pending" : "paid",
    };
  });

  // ---- Activity (live login/event log) ----
  const activity = log.slice(0, 6).map((e) => {
    const who  = e.user_name || "System";
    const proj = e.project_customer || e.project_access_id || null;
    let icon = "blue", title = "";
    if (e.event_type === "login")       { icon = "blue";  title = `${who} signed in`; }
    else if (e.event_type === "logout") { icon = "amber"; title = `${who} signed out`; }
    else if (e.event_type === "pin_access") { icon = "gold"; title = e.notes || `PIN access${proj ? ` — ${proj}` : ""}`; }
    else if (e.event_type === "demo")   { icon = "green"; title = `New inquiry${proj ? ` — ${proj}` : ""}`; }
    else { icon = "gold"; title = e.notes || e.event_type; }
    return { icon, title, who, when: e.login_at, role: e.user_role || null };
  });

  // ---- Recent customers ----
  const customers = custStat.map((c) => ({
    name:     c.customer,
    address:  c.address || "",
    slug:     encodeURIComponent(c.customer),
    total:    c.total_projects,
    active:   c.active_count,
    initials: initials(c.customer),
  }));

  return (
    <AdminClient
      user={user}
      alerts={alerts}
      kpis={kpis}
      projects={projects}
      tickets={tickets}
      technicians={technicians}
      payroll={payroll}
      activity={activity}
      customers={customers}
    />
  );
}
