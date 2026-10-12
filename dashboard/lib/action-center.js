// The canonical cross-platform action queue — ONE source of "what needs attention" for the whole
// portal. Both the dashboard (top slice → Needs Attention) and the Action Center page (full, grouped
// by category) derive from this, so there is never a second, competing task system. Pure: callers pass
// live data in, it classifies and ranks. It never mutates anything — the real actions live on the
// records each item links to.

export const ACTION_CATEGORIES = [
  { key: "critical",   label: "Critical",         sev: 3 },
  { key: "approval",   label: "Needs Approval",   sev: 2 },
  { key: "customer",   label: "Needs Customer",   sev: 2 },
  { key: "technician", label: "Needs Technician", sev: 2 },
  { key: "payment",    label: "Needs Payment",    sev: 2 },
  { key: "scheduling", label: "Needs Scheduling", sev: 1 },
  { key: "qc",         label: "Needs QC",         sev: 1 },
];
const SEV = Object.fromEntries(ACTION_CATEGORIES.map((c) => [c.key, c.sev]));

function ageDays(ts) {
  if (!ts) return null;
  const t = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
}

// input: { jobs, receivables, tickets, serviceCalls, pendingWorkOrders, pendingExpenses, pendingRequests }
// Each item: { category, sev, label, reason, href, age }. Returns { items (ranked), byCategory, count }.
export function buildActionItems(input = {}) {
  const {
    jobs = [], receivables = [], tickets = [], serviceCalls = [],
    pendingWorkOrders = [], pendingExpenses = [], pendingRequests = [],
  } = input;
  const items = [];
  const add = (category, label, reason, href, age) =>
    items.push({ category, sev: SEV[category], label: label || "Item", reason, href, age: age ?? null });

  // Critical — money at risk or something failing in the field.
  for (const r of receivables) if ((+r.balance || 0) > 0 && (+r.daysOut || 0) >= 30)
    add("critical", r.customer || r.contact_name, `Payment overdue · $${Math.round(r.balance).toLocaleString()}`, `/project/${r.access_id}`, r.daysOut);
  for (const t of tickets) if (t.priority === "urgent")
    add("critical", t.subject || t.project_customer, "Urgent ticket", `/tickets/${t.id}`, ageDays(t.created_at));
  for (const c of serviceCalls) if (["urgent", "high"].includes(c.priority))
    add("critical", c.customer || c.business_name, "Service call", `/service-calls/${c.id}`, ageDays(c.created_at));

  // Needs Approval — waiting on a manager/admin sign-off.
  for (const w of pendingWorkOrders)
    add("approval", w.project_customer || w.customer, "Work order approval", w.project_access_id ? `/project/${w.project_access_id}` : "/operations", ageDays(w.submitted_at || w.created_at));
  for (const e of pendingExpenses)
    add("approval", e.submitted_by_name || e.project_customer, "Expense approval", "/operations", ageDays(e.created_at));
  for (const q of pendingRequests)
    add("approval", q.project_customer || q.submitted_by_name, "Request approval", "/operations", ageDays(q.created_at));

  // Needs Customer — the ball is in the customer's court.
  for (const j of jobs) if (j.stage === "proposal")
    add("customer", j.customer, "Awaiting signature", `/project/${j.access_id}`, ageDays(j.created_at));

  // Needs Technician — approved work with nobody assigned.
  for (const j of jobs) if (["schedule", "install"].includes(j.stage) && (!j.tech || !String(j.tech).trim()))
    add("technician", j.customer, "Needs technician", `/project/${j.access_id}`, ageDays(j.created_at));

  // Needs Payment — outstanding balance, not yet overdue.
  for (const r of receivables) if ((+r.balance || 0) > 0 && (+r.daysOut || 0) < 30)
    add("payment", r.customer || r.contact_name, `Balance due · $${Math.round(r.balance).toLocaleString()}`, `/project/${r.access_id}`, r.daysOut);

  // Needs Scheduling — ready to book, or a survey still open.
  for (const j of jobs) if (j.stage === "approval_deposit")
    add("scheduling", j.customer, "Ready to schedule", `/project/${j.access_id}`, ageDays(j.created_at));
  for (const j of jobs) if (j.stage === "site_survey")
    add("scheduling", j.customer, "Survey incomplete", `/project/${j.access_id}`, ageDays(j.created_at));

  // Needs QC — install done, awaiting quality check.
  for (const j of jobs) if (j.stage === "qc")
    add("qc", j.customer, "QC review", `/project/${j.access_id}`, ageDays(j.created_at));

  items.sort((a, b) => b.sev - a.sev || (b.age || 0) - (a.age || 0));
  const byCategory = {};
  for (const c of ACTION_CATEGORIES) byCategory[c.key] = items.filter((x) => x.category === c.key);
  return { items, byCategory, count: items.length };
}
