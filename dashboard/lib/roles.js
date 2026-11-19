// Role × capability map — ONE place that says what each role may see or do on a project.
// Pure data, safe on client and server. Server actions still enforce their own checks (they call
// `can` too); components read it so role string comparisons stop spreading through JSX.
//
// Roles: admin · manager · sales · tech · customer · vendor · readonly.
//   sales    — sells; sees status + line items, never payout / rates / cost, never edits progress.
//   vendor   — supplies gear; sees shipment tracking + the job-site address, nothing else.
//   readonly — view-everything-act-nothing (auditor); rendered like the office, every control off.
const CAPS = {
  // Install phase
  "install.view":        ["admin", "manager", "sales", "tech", "readonly"],
  "install.edit":        ["admin", "manager", "tech"],                      // mark steps, add/remove lines, crew (office only for crew)
  "install.pay.view":    ["admin", "manager", "tech", "readonly"],          // payout figures (tech: their own)
  "install.pay.edit":    ["admin", "manager"],
  "install.photos.view": ["admin", "manager", "sales", "tech", "readonly"],
  "install.photos.edit": ["admin", "manager", "tech"],
  "issue.report":        ["admin", "manager", "tech"],
  "issue.adjudicate":    ["admin", "manager"],                              // assign rework, resolve, dismiss, reopen
  "issue.view":          ["admin", "manager", "sales", "tech", "readonly"],
  "addendum.view":       ["admin", "manager", "sales", "tech", "customer", "readonly"],
  "addendum.build":      ["admin", "manager", "sales", "tech"],             // tech logs work only (no prices)
  "addendum.price":      ["admin", "manager"],
  "addendum.sign":       ["customer"],
  "addendum.retail.view":["admin", "manager", "sales", "customer", "readonly"],
  "addendum.payout.view":["admin", "manager", "tech", "readonly"],
  "tracking.view":       ["admin", "manager", "sales", "vendor", "readonly"],
  "tracking.edit":       ["admin", "manager", "vendor"],
  // Work order document (docs/WORK_ORDERS.md). Distinct from install.* because the work order is a
  // DOCUMENT with its own scope, payout and signature — only the office writes it; the tech signs it
  // and marks its lines in the field. `wo.payout.view` is the role gate; the per-work-order
  // "Show payouts to tech" toggle is a second, narrower gate on top of it (requirement 7).
  "wo.view":             ["admin", "manager", "sales", "tech", "readonly"],
  "wo.edit":             ["admin", "manager"],                              // scope, payout, notes, revisions
  "wo.payout.view":      ["admin", "manager", "tech", "readonly"],
  "wo.payout.edit":      ["admin", "manager"],
  "wo.send":             ["admin", "manager"],                              // send a version for signature
  "wo.sign":             ["tech"],                                          // accept = assignment
  "wo.sign.void":        ["admin", "manager"],
  "wo.checkin":          ["admin", "manager", "tech"],                      // "I'm on site"
  "wo.line.status":      ["admin", "manager", "tech"],                      // Complete / Needs attention / Incomplete
  "wo.day.close":        ["admin", "manager", "tech"],                      // End of day (admin may close for a tech)
  "wo.close":            ["admin", "manager"],
  "payroll.view":        ["admin", "manager"],
  "payroll.export":      ["admin"],
  // QC / closeout
  "qc.edit":             ["admin", "manager", "tech"],
  "qc.sign.manager":     ["admin", "manager"],
  "qc.sign.customer":    ["customer"],
  "qc.view":             ["admin", "manager", "sales", "tech", "readonly"],
  // Site survey. Techs are the people who actually walk the site, so they may edit the survey, reopen a
  // submitted one and send it back for approval — which is NOT true of tool blobs in general (see
  // `saveToolDataAction` / /api/tool-data, where everything else stays office-only). These three move
  // together on purpose: unlock without edit, or edit without resubmit, strands a tech's work on one
  // device, which is the same silent data loss as not saving at all.
  "survey.edit":         ["admin", "manager", "sales", "tech"],   // write the survey2 blob
  "survey.unlock":       ["admin", "manager", "sales", "tech"],   // reopen a submitted survey for edits
  "survey.submit":       ["admin", "manager", "sales", "tech"],   // send / re-send it for customer approval
  // Proposals
  "proposal.reuse":      ["admin", "manager", "sales"],                     // search old proposals, copy, import, pick a destination
  "proposal.revise":     ["admin", "manager"],                             // AI #2: remove a line, or revise a sent/signed proposal (supersede → v+1)
  // Money / lifecycle
  "stage.move":          ["admin", "manager"],
  // Section O (legacy migration): hand-set a legacy project's stage / completion when the recorded
  // data genuinely cannot decide it. Stricter than stage.move — ADMIN ONLY — because it bypasses the
  // evidence instead of following it, and it is logged to the project event log every time.
  "legacy.override":     ["admin"],
  "assignment.edit":     ["admin", "manager"],                              // add/remove a tech on a project (matches addAssignmentAction)
  "customer.contact.view": ["admin", "manager", "sales", "tech", "readonly"], // name / phone / email
  "customer.financials.view": ["admin", "manager", "sales", "customer", "readonly"],
  // Project header icons. A customer gets Navigate + Share only: adding the contact to an address book and
  // editing the project's contact record are staff actions. `project.contact.edit` is enforced by
  // `updateProjectInfoAction` (server) — the header merely reads it to decide whether to draw the pencil.
  "project.contact.edit": ["admin", "manager", "sales", "tech"],
  "project.contact.save": ["admin", "manager", "sales", "tech", "readonly"],   // "add person" (vCard)
  // CRM (New Project → Existing / New client). Customers never search the CRM.
  "customer.search":     ["admin", "manager", "sales"],                     // search + pick an existing client
  "customer.create":     ["admin", "manager", "sales"],                     // create a client with a project
  "customer.edit":       ["admin", "manager"],                              // "Update client record" from the form
  "customer.duplicate.override": ["admin", "manager"],                      // "Create new anyway" past a duplicate warning
  "cost.view":           ["admin", "manager"],
  // SEO engine (lib/seo.js, /dev/seo). Internal marketing tooling — staff only; customers never touch it.
  "seo.view":            ["admin", "manager"],
  "seo.edit":            ["admin", "manager"],                              // create/edit records, facts, briefs, drafts
  "seo.approve":         ["admin", "manager"],                              // move a page to "approved"
  "seo.publish":         ["admin"],                                          // flip a page live (passes the publish gate)
  "seo.admin":           ["admin"],                                          // fact verification, settings
};
export const ROLE_KEYS = ["admin", "manager", "sales", "tech", "customer", "vendor", "readonly"];
export function can(role, cap) {
  const list = CAPS[cap];
  if (!list) throw new Error(`Unknown capability: ${cap}`);
  return list.includes(role);
}
// Roles that only ever read a project page (no mutation control renders for them).
export const VIEW_ONLY_ROLES = new Set(["readonly", "sales", "vendor"]);
export const isViewOnlyRole = (role) => VIEW_ONLY_ROLES.has(role);

// Which HALVES of the project page a role may see — the Customer / Internal split on the hub.
// "customer" = what the client sees (survey, proposal, closeout, completion).
// "internal"  = the office/field side (work order, payouts, activation QR).
// ONE source for both the card list and whether the toggle renders at all, so a role can never be
// shown a toggle to a half it is not allowed into — the two used to be decided separately, which is
// how a tech ended up with a Customer tab onto the client's proposal.
//   admin · manager · sales — both halves, so they get the toggle.
//   tech                    — internal only: the field side, never the customer's proposal or pricing.
//   vendor                  — customer only: they supply gear and see the job, not the office's work.
//   customer · readonly     — the customer half only.
const PROJECT_GROUPS = {
  admin:    ["customer", "internal"],
  manager:  ["customer", "internal"],
  sales:    ["customer", "internal"],
  tech:     ["internal"],
  vendor:   ["customer"],
  customer: ["customer"],
  readonly: ["customer"],
};
export const projectGroups = (role) => PROJECT_GROUPS[role] || ["customer"];
export const seesProjectGroup = (role, group) => projectGroups(role).includes(group || "customer");
// The toggle exists only where the role actually has both halves to switch between.
export const hasGroupToggle = (role) => projectGroups(role).length > 1;
// Where a role lands first: its only half, or Customer when it has both.
export const defaultProjectGroup = (role) => {
  const g = projectGroups(role);
  return g.includes("customer") ? "customer" : g[0];
};
// ONE role colour language, so "whose view am I in" reads the same everywhere it is shown — the role
// pill, the progress tint and the demo bar. Gold = office (admin/manager), blue = customer, green =
// field (tech/vendor), purple = sales, grey = read-only. bg/fg are a legible pair; use them together.
export const ROLE_COLOR = {
  admin:    { bg: "#C9A96E", fg: "#0B0F1A" },
  manager:  { bg: "#C9A96E", fg: "#0B0F1A" },
  customer: { bg: "#4b6a9b", fg: "#fff" },
  tech:     { bg: "#2f7d5a", fg: "#fff" },
  sales:    { bg: "#7a5ea8", fg: "#fff" },
  vendor:   { bg: "#2f7d5a", fg: "#fff" },
  readonly: { bg: "#6f7686", fg: "#fff" },
};
export const roleColor = (role) => ROLE_COLOR[role] || ROLE_COLOR.readonly;
export { CAPS };
