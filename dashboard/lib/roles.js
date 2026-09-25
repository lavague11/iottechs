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
  // QC / closeout
  "qc.edit":             ["admin", "manager", "tech"],
  "qc.sign.manager":     ["admin", "manager"],
  "qc.sign.customer":    ["customer"],
  "qc.view":             ["admin", "manager", "sales", "tech", "readonly"],
  // Proposals
  "proposal.reuse":      ["admin", "manager", "sales"],                     // search old proposals, copy, import, pick a destination
  // Money / lifecycle
  "stage.move":          ["admin", "manager"],
  "customer.contact.view": ["admin", "manager", "sales", "tech", "readonly"], // name / phone / email
  "customer.financials.view": ["admin", "manager", "sales", "customer", "readonly"],
  "cost.view":           ["admin", "manager"],
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
export { CAPS };
