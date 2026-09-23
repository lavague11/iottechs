// ─────────────────────────────────────────────────────────────────────────────
// THE deck tool manifest — which tool cards exist in each lifecycle phase and which role sees
// each (and how). ONE source: the project page's deckToolsFor() asks `sees()` before it pushes a
// card, and the Role & Flow Map's PHASE_BLOCKS is derived from this object — neither is hand-
// mirrored any more (tests/lifecycle.test.mjs holds them together).
//
// access per role: "edit" (can act) · "view" (read-only). A role absent from a tool never sees it.
// Data conditions (e.g. the customer only sees Add-ons once one exists) stay in deckToolsFor —
// this file answers "may this role see it at all", not "is there anything to show yet".
// ─────────────────────────────────────────────────────────────────────────────
export const DECK_TOOLS = {
  // Consulting = the System Planner (survey map + camera views), one workspace for every role.
  ph_survey: [
    { name: "Site Survey",          access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "view", readonly: "view" } },
    { name: "Mockups",              access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "view", readonly: "view" } },
  ],
  ph_proposal: [
    { name: "Proposal",             access: { admin: "edit", manager: "edit", sales: "edit", tech: "view", customer: "edit", readonly: "view" } },
    { name: "Tech Board",           access: { tech: "view" } },
    { name: "Approval & Deposit",   access: { admin: "edit", manager: "edit", customer: "edit", readonly: "view" } },
    { name: "Create Work Order",    access: { admin: "edit", manager: "edit" } },
  ],
  // Sales reads Install (status, line items, add-ons, issue state) — never pay, rates or edits.
  // Vendor sees shipment tracking only. Readonly sees the office layout with every control off.
  ph_install: [
    { name: "Addendum",             access: { admin: "edit", manager: "edit", sales: "view", tech: "edit", customer: "view", readonly: "view" } },
    { name: "Work Order",           access: { admin: "edit", manager: "edit", sales: "view", tech: "edit", readonly: "view" } },
    { name: "Shipment Tracking",    access: { vendor: "edit" } },
    { name: "Project Ready",        access: { customer: "view" } },
    { name: "Set Up Your Phone",    access: { customer: "view" } },
  ],
  // Closeout: Activation QR handover, final payment, internal QC (+ the customer's walkthrough card).
  ph_wrap: [
    { name: "System QR",            access: { admin: "edit", manager: "edit", tech: "edit", customer: "view", readonly: "view" } },
    { name: "Final Payment",        access: { admin: "edit", manager: "edit", customer: "edit" } },
    { name: "Quality Control",      access: { admin: "edit", manager: "edit", sales: "view", tech: "edit", readonly: "view" } },
    { name: "Walkthrough",          access: { customer: "edit" } },
  ],
  // Completion: read-only "all done" wrap-up (certificate / warranty / payout).
  ph_complete: [
    { name: "Completion / Wrap-up", access: { admin: "edit", manager: "edit", sales: "view", tech: "view", customer: "view", readonly: "view" } },
  ],
};

// May `role` see tool `name` in `phaseKey` at all? (Data conditions are the caller's business.)
export function sees(role, phaseKey, name) {
  const t = (DECK_TOOLS[phaseKey] || []).find((x) => x.name === name);
  return !!(t && t.access[role]);
}
// The access level ("edit" | "view" | undefined) — for components that render read-only per role.
export function accessOf(role, phaseKey, name) {
  const t = (DECK_TOOLS[phaseKey] || []).find((x) => x.name === name);
  return t ? t.access[role] : undefined;
}
