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
  inquiry: [
    { label: "Survey appointment scheduled", who: "internal", check: (p) => !!p.date },
  ],
  site_survey: [
    { label: "Customer accepted the site survey", who: "customer", check: (p) => !!p.survey_accepted },
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
    { label: "Customer confirmed the install appointment", who: "customer" },
  ],
  install: [
    { label: "Install checklist completed", who: "internal" },
    { label: "Install photos uploaded", who: "internal" },
  ],
  qc: [
    { label: "Manager QC approved", who: "internal" },
    { label: "Customer walkthrough / acceptance signed", who: "customer" },
  ],
  payment: [
    { label: "Final balance paid", who: "customer", check: (p) => !!p.final_balance_paid },
  ],
  completion: [
    { label: "Completion documents generated", who: "internal" },
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
