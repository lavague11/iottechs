// Sandbox ("Demo") — an admin-only THROWAWAY copy of a project used to walk through the product as any
// role. Inside a sandbox nothing is simulated: it is a real project row, so signing, paying, approving and
// advancing all run the real code paths. The safety comes from WHAT it is, not from disabling things:
//
//   1. It is a different project, so the live job is never touched.
//   2. It can never email anyone — it is stamped source='journey-test' AND given a @journey-test.local
//      contact, which are exactly the two checks lib/email.js isDemoProject() reads, and every customer
//      send already routes through that guard.
//   3. It is hidden from every list, count and report (sandboxWhere / SANDBOX_HIDE_SQL below).
//   4. It is disposable — Discard deletes it outright.
//
// Pure + dependency-free so the server, the client and the tests can all import it.

// The one test for "is this row a sandbox". Never infer it from the name, the source or the email —
// those are belt-and-braces; this column is the fact.
export const isSandbox = (p) => !!(p && p.sandbox_of);

// Stamped onto every sandbox so lib/email.js isDemoProject() short-circuits each send.
export const SANDBOX_SOURCE = "journey-test";
export const sandboxEmail = (accessId) => `sandbox-${String(accessId || "x").toLowerCase()}@journey-test.local`;

// Prefix on the business name so a sandbox is unmistakable anywhere one does leak into a view.
export const SANDBOX_TAG = "[DEMO]";
export const tagSandboxName = (name) => {
  const base = String(name || "Project").replace(/^\[DEMO\]\s*/i, "").trim();
  return `${SANDBOX_TAG} ${base}`.slice(0, 200);
};

// Hide sandboxes from a projects query. Pass the table alias when the query joins ("p" → "p.sandbox_of").
// Every list, count, dashboard tile, receivables row and search result must carry this.
export const SANDBOX_HIDE_SQL = (alias = "") => `${alias ? alias + "." : ""}sandbox_of IS NULL`;

// Which roles an admin may step into inside a sandbox, in the order the switcher shows them.
// "admin" is the way back out, so it is not a destination in this list.
export const SANDBOX_ROLES = ["customer", "tech", "sales", "manager", "vendor", "readonly"];
export const SANDBOX_ROLE_LABEL = {
  customer: "Customer", tech: "Technician", sales: "Sales",
  manager: "Manager", vendor: "Vendor", readonly: "Read-only",
};

// Who may create / enter / discard a sandbox. Owner's rule: admin only — a manager does not get to walk
// around in other roles, a tech never sees a customer view, and a customer never sees this at all.
export const canSandbox = (role) => role === "admin";

// A role an admin asked to view a sandbox as (?as=). Anything unrecognised falls back to no switch.
export function sandboxRoleFrom(value) {
  const r = String(value || "").trim().toLowerCase();
  return SANDBOX_ROLES.includes(r) || r === "admin" ? r : null;
}

// Which per-project tables a sandbox copies from its source, and the column holding the project key.
// Everything NOT listed starts empty in the sandbox: payments, events, notes, work orders, expenses,
// requests, install issues, reminders and signing documents are all things you go and DO in the demo.
export const SANDBOX_COPY_TABLES = [
  { table: "project_tool_data", key: "project_access_id" },   // survey, mockup, schedule — the built content
  { table: "proposals", key: "project_access_id" },           // every version, so a sent proposal is sent here too
  { table: "stage_acceptances", key: "project_access_id" },   // survey/mockup sign-offs already given
];

// Child tables wiped when a sandbox is discarded — every table keyed by a project access id. Kept as one
// list so a new per-project table is added in a single place rather than leaking rows on discard.
// NOTE the key column differs per table — `documents` and `expenses` use `access_id`, the rest use
// `project_access_id`. `appt_reminders` is keyed by an event string, not a project, so it is not here.
export const SANDBOX_CHILD_TABLES = [
  ["project_tool_data", "project_access_id"], ["proposals", "project_access_id"],
  ["stage_acceptances", "project_access_id"], ["stage_transitions", "project_access_id"],
  ["project_payments", "project_access_id"], ["project_events", "project_access_id"],
  ["project_notes", "project_access_id"], ["project_views", "project_access_id"],
  ["proposal_views", "project_access_id"], ["install_issues", "project_access_id"],
  ["project_assignments", "project_access_id"], ["work_orders", "project_access_id"],
  ["requests", "project_access_id"],
  ["documents", "access_id"], ["expenses", "access_id"],
];
