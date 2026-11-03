// Staff Project Hub (Phase 1) — resolves whether a project renders the clean, customer-style hub for STAFF
// instead of the stage deck. Pure (the secretValue read stays in the server layer); mirrors the Customer
// Portal V2 resolver exactly. The hub is presentation only: the same tools open from its cards, in staff
// (editable) mode, so no lifecycle / role / money logic changes.
import { eligibleForCustomerPortalV2 } from "./customer-portal";

// Same eligibility as the customer portal: install projects (type A/B). Service calls (type C) keep their
// own gateway, so they stay on the deck.
export function eligibleForStaffHub(project) {
  return eligibleForCustomerPortalV2(project);
}

// Simple view (the hub, "V2") is the DEFAULT for eligible projects. Only an explicit "deck" override
// (Advanced view, "V1") opts out. `staff_view`: "deck" → Advanced deck · "hub"/null/undefined → Simple hub.
// (The old global STAFF_PROJECT_HUB flag is no longer consulted — Simple is simply the default now.)
export function staffHubFor(project) {
  if (!eligibleForStaffHub(project)) return false;
  return project?.staff_view !== "deck";
}

// The Simple view (hub + customer portal) shows a 3-step progress rail, not the full 5-phase lifecycle:
// Consulting (= consulting + proposal), Install, Completion (= closeout + completion). Collapses whichever
// of the 5 master phases is current into one of the three. Returns { phases:[{key,label,unlocked}], currentKey }.
const SIMPLE_STEPS = [
  { key: "consulting", label: "Consulting" },
  { key: "install", label: "Install" },
  { key: "completion", label: "Completion" },
];
// The 5 master phase keys (lib/spec PHASES) → the 3 Simple steps.
const PHASE_TO_STEP = { ph_survey: "consulting", ph_proposal: "consulting", ph_install: "install", ph_wrap: "completion", ph_complete: "completion" };
export function threeStepPhases(currentPhaseKey) {
  const currentKey = PHASE_TO_STEP[currentPhaseKey] || "consulting";
  const curIdx = SIMPLE_STEPS.findIndex((s) => s.key === currentKey);
  const phases = SIMPLE_STEPS.map((s, i) => ({ key: s.key, label: s.label, unlocked: i <= curIdx }));
  return { phases, currentKey };
}
