// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the Role & Flow Map (/dev/role-map).
//
// Phases, stages and step-counts are NOT here — the map imports those live from
// spec.js (PHASES) and stage-flow.js (STAGE_FLOW), so they can never drift.
//
// What IS here: the per-phase block list and who sees each block (and how). The
// gateway's project page (app/project/[accessId]/gateway-client.jsx) renders these
// blocks via role-gated JSX; this file mirrors that render so the map reflects it.
// When you add/move/gate a block on the project page, update the matching entry
// here — one small declarative edit, and the map updates everywhere it's shown.
//
// access value per role: "edit" (can act) · "view" (read-only) · "issue" (flagged
// over-exposure). A role omitted from a block's `access` map simply doesn't see it.
// ─────────────────────────────────────────────────────────────────────────────

export const PHASE_COLORS = {
  ph_survey:   "#C9A96E",
  ph_proposal: "#7c3aed",
  ph_install:  "#3257ff",
  ph_wrap:     "#1c8a45",
};

export const ROLES = [
  { key: "admin",    label: "Admin",      color: "#C9A96E" },
  { key: "manager",  label: "Manager",    color: "#C9A96E" },
  { key: "sales",    label: "Sales",      color: "#7c3aed" },
  { key: "tech",     label: "Technician", color: "#1c8a45" },
  { key: "customer", label: "Customer",   color: "#3257ff" },
];

export const PHASE_BLOCKS = {
  ph_survey: [
    { name: "Your Information",            access: { customer: "edit" } },
    { name: "Schedule Appointment",        access: { customer: "edit" } },
    { name: "Survey Scheduling & Notes",   access: { admin: "edit", manager: "edit", sales: "edit", tech: "issue" } },
    { name: "Site Survey",                 access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "edit" } },
    { name: "Mockups",                     access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "edit" } },
  ],
  ph_proposal: [
    { name: "Proposal Views",              access: { admin: "view", manager: "view", sales: "view" } },
    { name: "Proposal Builder",            access: { admin: "edit", manager: "edit", sales: "edit" } },
    { name: "Proposal · accept / decline", access: { customer: "edit" } },
    { name: "Tech Board",                  access: { tech: "view" } },
    { name: "Work Order",                  access: { tech: "edit" } },
    { name: "Approval & Deposit",          access: { admin: "edit", manager: "edit" } },
    { name: "Make Your Deposit",           access: { customer: "edit" } },
  ],
  ph_install: [
    { name: "Install Scheduling",          access: { admin: "edit", manager: "edit", customer: "view" } },
    { name: "Shipment Tracking",           access: { admin: "edit", manager: "edit", customer: "view" } },
    { name: "System QR",                   access: { admin: "view", manager: "view", tech: "view" } },
    { name: "Equipment / Work Order",      access: { admin: "edit", manager: "edit", tech: "edit", customer: "view" } },
    { name: "Job-Site Add-ons",            access: { admin: "edit", manager: "edit", tech: "view", customer: "view" } },
    { name: "Tech Pricing",                access: { admin: "edit", manager: "edit" } },
  ],
  ph_wrap: [
    { name: "QC Checklist",                access: { admin: "edit", manager: "edit", sales: "view", tech: "view", customer: "view" } },
    { name: "Final Payment",               access: { admin: "edit", manager: "edit", customer: "edit" } },
    { name: "Completion / Wrap-up",        access: { admin: "edit", manager: "edit", sales: "view", tech: "view", customer: "view" } },
  ],
};

// Blocks a role sees in a phase, with the access level flattened onto each.
export function blocksForRole(phaseKey, role) {
  return (PHASE_BLOCKS[phaseKey] || [])
    .filter((b) => b.access[role])
    .map((b) => ({ name: b.name, a: b.access[role] }));
}

// Per-role caveats surfaced above the flow.
export const ROLE_NOTES = {
  manager: "Identical to Admin — no manager-specific restriction exists in code.",
  sales:   "Blind in the Install phase — no render branch. Loses the job once it's being built.",
  tech:    "Over-exposed in Consulting — sees office intake tools it shouldn't.",
};

// Audit findings shown in the dark panel.
export const FINDINGS = [
  { tag: "REMOVE",    cls: "rm-i-remove",    text: "Dead 5-phase code (CUSTOMER_PHASES) — 0 usages, superseded by the 4-phase bar (2026-07-13)." },
  { tag: "TRIM",      cls: "rm-i-trim",      text: "Tech sees office intake tools (Survey Scheduling & Notes) in Consulting." },
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Sales sees NOTHING in the Install phase — no branch exists." },
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Vendor & Readonly roles have no render branch on the project page at all." },
  { tag: "REDUNDANT", cls: "rm-i-redundant", text: "Proposal phase stacks two heavy money panels (Proposal Builder + Approval & Deposit)." },
];
