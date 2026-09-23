// Stage flow — the single source of truth for "what must be done to leave each stage,
// and WHOSE job it is". Pure module (no DB, no React) so the gateway renders per-role
// to-do strips from it AND the server auto-advances stages from it — one matrix, no drift.
//
// Each requirement: { label, who: "customer" | "internal", check(facts, assignments) }.
// `facts` is a plain object (the page's `project` object client-side; db.buildStageFacts
// server-side — same field names by contract).

export const MASTER_ORDER = [
  "inquiry", "site_survey", "proposal", "approval_deposit",
  "schedule", "install", "qc", "payment", "completion",
];

// Stages the server may auto-advance out of once every requirement passes. `schedule`/
// `install`/`qc` involve field work a human must verify and stay manual on purpose. `payment`
// is a pure financial fact (balance is $0 or it isn't) so it auto-advances to completion too.
export const AUTO_STAGES = new Set(["inquiry", "site_survey", "proposal", "approval_deposit", "payment"]);

export const STAGE_FLOW = {
  // A survey that was explicitly skipped (projects.survey_skipped_at — monitoring/ADT, phone-quoted
  // work) satisfies both Consulting requirements, so those jobs don't jam at the first seam.
  // `waiver` is documentation for the Role & Flow Map: the alternative fact that also satisfies the check.
  inquiry: [
    { label: "Survey appointment scheduled", who: "internal", waiver: "survey skipped", check: (p) => !!p.date || !!p.survey_skipped },
  ],
  site_survey: [
    { label: "Customer accepted the site survey", who: "customer", waiver: "survey skipped", check: (p) => !!p.survey_accepted || !!p.survey_skipped },
  ],
  proposal: [
    { label: "Proposal submitted to customer", who: "internal", check: (p) => ["sent", "changes_requested", "accepted", "declined"].includes(p.proposal_status) },
    { label: "Customer accepted an option", who: "customer", check: (p) => p.proposal_status === "accepted" },
  ],
  approval_deposit: [
    { label: "Customer accepted the proposal", who: "customer", check: (p) => p.proposal_status === "accepted" },
    { label: "Customer signed the agreement", who: "customer", check: (p) => !!p.proposal_signed },
    { label: "Deposit submitted", who: "customer", check: (p) => !!p.deposit_submitted },
    { label: "Deposit receipt confirmed", who: "internal", check: (p) => !!p.deposit_recorded },
  ],
  schedule: [
    { label: "Technician accepted the work order", who: "internal", check: (p, a) => !!(p.tech_accepted || p.tech || (a || []).some((x) => x.role === "tech")) },
    // Server-recorded RSVP on the install event (schedule blob confirmations / confirmed_at).
    { label: "Customer confirmed the install appointment", who: "customer", check: (p) => !!p.install_confirmed },
  ],
  // Every requirement is check-backed now (2026-09-23): work order + issue flags, install photos
  // (media kind "install"), the QC sign-offs and the completion stamp are all real server facts.
  install: [
    { label: "Install checklist completed", who: "internal", check: (p) => !!p.install_done },
    { label: "Install photos uploaded", who: "internal", check: (p) => !!p.install_photos },
  ],
  qc: [
    { label: "Manager QC approved", who: "internal", check: (p) => !!p.qc_manager_approved },
    { label: "Customer walkthrough / acceptance signed", who: "customer", check: (p) => !!p.qc_customer_signed },
  ],
  payment: [
    { label: "Final balance paid", who: "customer", check: (p) => !!p.final_balance_paid },
  ],
  completion: [
    // projects.completed_at is the certificate/warranty issuance stamp (CompletionPanel "Mark complete").
    { label: "Completion documents generated", who: "internal", check: (p) => !!p.completion_docs },
  ],
};

// Requirements of `stageKey` still unmet → [{ label, who }]. A requirement without a
// check() is a manual judgement call — always listed until the stage is moved by hand.
export function missingReqs(stageKey, facts, assignments) {
  return (STAGE_FLOW[stageKey] || [])
    .filter((req) => (req.check ? !req.check(facts, assignments || []) : true))
    .map((req) => ({ label: req.label, who: req.who || "internal" }));
}

export function nextStageOf(stageKey) {
  const i = MASTER_ORDER.indexOf(stageKey);
  return i >= 0 && i < MASTER_ORDER.length - 1 ? MASTER_ORDER[i + 1] : null;
}

// ENFORCEABLE unmet requirements: only the ones backed by a real check() and currently failing.
// Manual-judgement requirements (no check — install checklist, QC sign-off, completion docs) are
// advisory and NEVER hard-lock a stage. This is what the phase gate locks on (Phase-1 scope), so it
// stays distinct from missingReqs() (which also lists the manual reqs for the "next step" to-do text).
export function blockingReqs(stageKey, facts, assignments) {
  return (STAGE_FLOW[stageKey] || [])
    .filter((req) => req.check && !req.check(facts, assignments || []))
    .map((req) => ({ label: req.label, who: req.who || "internal" }));
}

// Walk `order` forward from `fromIdx` (the project's current stage); a stage is passable only when
// its enforceable requirements are met. Returns the furthest stage index the project may occupy —
// i.e. it stops AT the first stage with an unmet enforceable requirement. Never regresses below
// `fromIdx`, so a project already legitimately at a later stage is not retro-locked (this is the
// "lock advancement, don't retro-lock" rule).
export function gateThroughIndex(facts, assignments, order = MASTER_ORDER, fromIdx = 0) {
  let idx = Math.max(0, fromIdx);
  while (idx + 1 < order.length && blockingReqs(order[idx], facts, assignments).length === 0) idx++;
  return idx;
}
