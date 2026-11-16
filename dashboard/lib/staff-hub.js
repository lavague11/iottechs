// Staff Project Hub (Phase 1) — resolves whether a project renders the clean, customer-style hub for STAFF
// instead of the stage deck. Pure (the secretValue read stays in the server layer); mirrors the Customer
// Portal V2 resolver exactly. The hub is presentation only: the same tools open from its cards, in staff
// (editable) mode, so no lifecycle / role / money logic changes.
import { eligibleForCustomerPortalV2 } from "./customer-portal.js";

// Same eligibility as the customer portal: install projects (type A/B). Service calls (type C) keep their
// own gateway, so they stay on the deck.
export function eligibleForStaffHub(project) {
  return eligibleForCustomerPortalV2(project);
}

// Simple view (the hub) is now the ONE AND ONLY staff view for eligible install projects — the Advanced
// deck is retired for projects. The per-project `staff_view="deck"` override is no longer consulted (the
// column stays for history). Service calls (type C) are not hub-eligible and keep their own deck gateway.
export function staffHubFor(project) {
  return eligibleForStaffHub(project);
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

// Milestone-anchored overall progress for the 3-step rail (bug #83), one source of truth for both the
// percentage readout AND the segment fills so they can never disagree. Anchors from the owner:
//   • proposal SENT  → Consulting complete ........ 33%  (first of three segments full)
//   • signed + install appointment scheduled → ... 50%  (halfway through the Install segment)
//   • install work complete → .................... 66%  (Install segment full)
//   • QC / closeout complete → ................... 100% — but 90% while a balance is still owed
// Before a proposal is sent we ramp gently through Consulting as the survey/mockup come together.
export function simpleProgressPct(f = {}) {
  if (f.qcDone || f.completed) return f.balanceOwed ? 90 : 100;
  if (f.installDone) return 66;
  if (f.signed && f.scheduled) return 50;
  if (f.signed) return 45;
  if (f.scheduled) return 40;
  if (f.proposalSent) return 33;
  let c = 0;                                   // still in Consulting — partial credit as artifacts land
  if (f.surveyDone) c += 12;
  if (f.mockupDone) c += 10;
  if (f.proposalStarted) c += 6;
  return Math.min(30, c);
}

// The ONE mapping from project facts → simpleProgressPct inputs. The gateway used to build this object inline,
// so "what percent is this project at" lived inside a component where a test (and a second caller) couldn't
// reach it. Staff hub and customer portal both call this with the same facts, so they cannot disagree.
//   resolverFacts — the object handed to resolveProjectStatus (proposal_status, proposal_signed …)
//   sFacts/custFacts — stage-floored / raw lifecycle facts; hasInstallAppt — a real install appointment
//   finance — financeSummary (balanceOwed only counts when there is a contract that isn't paid in full)
export function progressFromFacts({ resolverFacts = {}, sFacts = {}, custFacts = {}, hasInstallAppt = false, completed = false, finance = null, proposalStarted = false } = {}) {
  return simpleProgressPct({
    proposalSent:    !!resolverFacts.proposal_status,
    signed:          !!resolverFacts.proposal_signed,
    scheduled:       !!(hasInstallAppt || sFacts.install_confirmed),
    installDone:     !!sFacts.install_done,
    qcDone:          !!custFacts.qc_customer_signed,
    completed:       !!completed,
    balanceOwed:     !!(finance && finance.hasContract && !finance.paidInFull),
    surveyDone:      !!custFacts.survey_done,
    mockupDone:      !!custFacts.mockup_done,
    proposalStarted: !!proposalStarted,
  });
}

// The ONE mapping from the canonical project STATE (project-status.resolveProjectStatus) → the 3-step rail.
// Derived from state alone — never the stored stage column, which goes stale — so the step can't disagree
// with the percent (both come from the same facts). AWAITING_DEPOSIT and earlier = Consulting;
// READY_TO_SCHEDULE … INSTALL_IN_PROGRESS = Install; AWAITING_FINAL_PAYMENT / COMPLETE = Completion.
// CLOSED_NOT_COMPLETED has no forward position, so the caller supplies `fallbackPhaseKey` (stored stage's phase).
const STATE_TO_PHASE = {
  READY_TO_SCHEDULE: "ph_install", INSTALL_SCHEDULED: "ph_install", INSTALL_IN_PROGRESS: "ph_install",
  AWAITING_FINAL_PAYMENT: "ph_wrap", COMPLETE: "ph_complete",
};
export function threeStepForState(state, fallbackPhaseKey = "ph_survey") {
  if (state === "CLOSED_NOT_COMPLETED") return threeStepPhases(fallbackPhaseKey);
  return threeStepPhases(STATE_TO_PHASE[state] || "ph_survey");
}
