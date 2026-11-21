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
//
// A demo opens on the REAL job. It used to copy only the built content on the reasoning above — but that
// left an admin walking a finished job through the roles while the demo showed no work order, no crew, no
// balance and an empty log. You cannot rehearse a job against a blank version of it, so a demo now starts
// as a faithful snapshot and you change it from there.
//
// Deliberately NOT copied: `project_views`/`proposal_views` are analytics about the real customer rather
// than project content, and `sign_documents`/`sign_sessions` are signed PDFs and live tokens bound to the
// source proposal's id, version and fingerprint — a copy of those would be bound to the wrong document.
export const SANDBOX_COPY_TABLES = [
  { table: "project_tool_data", key: "project_access_id" },   // survey, mockup, schedule — the built content
  { table: "proposals", key: "project_access_id" },           // every version, so a sent proposal is sent here too
  { table: "stage_acceptances", key: "project_access_id" },   // survey/mockup sign-offs already given
  { table: "project_assignments", key: "project_access_id" }, // who is on the job
  { table: "project_payments", key: "project_access_id" },    // so the demo's balance IS the real balance
  { table: "addendums", key: "project_access_id" },           // change orders raised on site
  { table: "install_issues", key: "project_access_id" },      // flagged work
  { table: "project_events", key: "project_access_id" },      // the Log reads like the real one
  { table: "project_notes", key: "project_access_id" },
  { table: "requests", key: "project_access_id" },
  { table: "expenses", key: "access_id" },
];

// The work order hangs off its OWN id, not the project's, so its children cannot ride the generic copy —
// they are remapped onto the new `wo` row (copySandboxWorkOrder in db.js).
//   wo_lines    — the per-line state the work order renders (what is done, what is flagged)
//   wo_versions — what was sent, so a sent work order reads as sent in the demo
// NOT copied: `wo_signatures`, because no technician ever signed the demo's document and showing their
// signature on it would be a lie; and the field/pay record — wo_checkins, wo_day_logs, wo_events,
// wo_line_credits, wo_line_media — which is that crew's real time and money, not project content.
export const SANDBOX_WO_COPY_TABLES = [
  { table: "wo_lines", key: "wo_id" },
  { table: "wo_versions", key: "wo_id" },
];
// Every wo-keyed table, for cleanup on discard. A superset of the copy list on purpose: a demo accrues its
// own check-ins, day logs and signatures once you work inside it, and those have to go too.
export const SANDBOX_WO_CHILD_TABLES = [
  "wo_lines", "wo_versions", "wo_signatures", "wo_checkins",
  "wo_day_logs", "wo_events", "wo_line_credits", "wo_line_media",
];

// Child tables wiped when a sandbox is discarded — every table keyed by a project access id. Kept as one
// list so a new per-project table is added in a single place rather than leaking rows on discard.
// NOTE the key column differs per table — `documents` and `expenses` use `access_id`, the rest use
// `project_access_id`. `appt_reminders` is keyed by an event string, not a project, so it is not here.
// `wo` is listed too: `work_orders` is the LEGACY table and the live work order lives in `wo`, so a demo's
// work order used to survive its own discard. Its children go by wo_id (SANDBOX_WO_CHILD_TABLES), which
// discardSandboxProject resolves before deleting the parent.
export const SANDBOX_CHILD_TABLES = [
  ["project_tool_data", "project_access_id"], ["proposals", "project_access_id"],
  ["stage_acceptances", "project_access_id"], ["stage_transitions", "project_access_id"],
  ["project_payments", "project_access_id"], ["project_events", "project_access_id"],
  ["project_notes", "project_access_id"], ["project_views", "project_access_id"],
  ["proposal_views", "project_access_id"], ["install_issues", "project_access_id"],
  ["project_assignments", "project_access_id"], ["work_orders", "project_access_id"],
  ["wo", "project_access_id"], ["addendums", "project_access_id"],
  ["requests", "project_access_id"],
  ["documents", "access_id"], ["expenses", "access_id"],
];
