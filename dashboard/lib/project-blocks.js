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

import { DECK_TOOLS } from "./deck-tools.js";

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
  { key: "vendor",   label: "Vendor",     color: "#2f7d5a" },
  { key: "readonly", label: "Read-only",  color: "#6f7686" },
];

// DERIVED from the deck tool manifest (lib/deck-tools.js) — the same object deckToolsFor() gates on,
// so the map can't drift from the page. Edit the manifest, not this.
export const PHASE_BLOCKS = DECK_TOOLS;

// Blocks a role sees in a phase, with the access level flattened onto each.
export function blocksForRole(phaseKey, role) {
  return (PHASE_BLOCKS[phaseKey] || [])
    .filter((b) => b.access[role])
    .map((b) => ({ name: b.name, a: b.access[role] }));
}

// Per-role caveats surfaced above the flow.
export const ROLE_NOTES = {
  manager:  "Identical to Admin — no manager-specific restriction exists in code.",
  sales:    "Install is read-only: status, line items, add-ons and issue state — no payout, rates, edits or dispute actions.",
  tech:     "Work Order stays locked until the tech has accepted it AND it's install day.",
  vendor:   "Shipment tracking only, plus the job-site address. No contact details, no money, no other steps.",
  readonly: "The office layout with every control off — nothing here mutates (server actions reject the role too).",
};

// Audit findings shown in the dark panel.
export const FINDINGS = [
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Final Payment is not rendered for the read-only role (the payment panel is a mutation surface); everything else is." },
  { tag: "TRIM",      cls: "rm-i-trim",      text: "All 16 requirement-steps are check-backed (2026-09-23): appointment RSVP, install photos (media kind \"install\") and the completion stamp joined the gate. Per-item QC acceptance (manager + customer, per device, own fingerprint) is live; the whole-list sign-offs remain the gate." },
];
