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
  ph_complete: "#0f766e",
};

export const ROLES = [
  { key: "admin",    label: "Admin",      color: "#C9A96E" },
  { key: "manager",  label: "Manager",    color: "#C9A96E" },
  { key: "sales",    label: "Sales",      color: "#7c3aed" },
  { key: "tech",     label: "Technician", color: "#1c8a45" },
  { key: "customer", label: "Customer",   color: "#3257ff" },
];

// Mirrors deckToolsFor() in gateway-client.jsx (the deck is the live project page). Scheduling is no
// longer a tool card (it lives on the contact action bar + header chip) and Shipment Tracking is
// archived, so neither appears here. Re-synced 2026-09-21.
export const PHASE_BLOCKS = {
  // Consulting = the System Planner (survey map + camera views), one workspace for every role.
  ph_survey: [
    { name: "Site Survey",                 access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "view" } },
    { name: "Mockups",                     access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "view" } },
  ],
  ph_proposal: [
    { name: "Proposal",                    access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "edit" } },
    { name: "Tech Board",                  access: { tech: "view" } },
    { name: "Approval & Deposit",          access: { admin: "edit", manager: "edit", customer: "edit" } },
    { name: "Create Work Order",           access: { admin: "edit", manager: "edit" } },
  ],
  ph_install: [
    { name: "Addendum",                    access: { admin: "edit", manager: "edit", tech: "edit", customer: "view" } },
    { name: "Work Order",                  access: { admin: "edit", manager: "edit", tech: "edit" } },
    { name: "Project Ready",               access: { customer: "view" } },
    { name: "Set Up Your Phone",           access: { customer: "view" } },
  ],
  // Step 4 — Closeout: Activation QR handover, final payment, internal QC.
  ph_wrap: [
    { name: "System QR",                   access: { admin: "edit", manager: "edit", tech: "edit", customer: "view" } },
    { name: "Final Payment",               access: { admin: "edit", manager: "edit", customer: "edit" } },
    { name: "Quality Control",             access: { admin: "edit", manager: "edit", sales: "view", tech: "edit" } },
  ],
  // Step 5 — Completion: read-only "all done" wrap-up (certificate / warranty / payout).
  ph_complete: [
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
  tech:    "Work Order stays locked until the tech has accepted it AND it's install day.",
};

// Audit findings shown in the dark panel.
export const FINDINGS = [
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Sales sees NOTHING in the Install phase — no branch exists." },
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Vendor & Readonly roles have no render branch on the project page at all." },
  { tag: "MISSING",   cls: "rm-i-missing",   text: "No 'survey skipped' path — an A/B project with no accepted survey hard-locks Proposal. Monitoring/ADT jobs only avoid it by living in their own flow." },
  { tag: "TRIM",      cls: "rm-i-trim",      text: "Only 10 of the 16 requirement-steps are check-backed; the other 6 (install-appointment confirm, install ×2, QC ×2, completion docs) are advisory and never gate." },
];
