// Project intelligence — the read-only "operational brain" for one project. Given the SAME stage facts and
// assignments the gate renders from (db.buildStageFacts + getProjectAssignments), it answers "where are we,
// what's stopping us, what can we do next, and whose turn is it" — distinguishing three things the owner
// asked for, not just the first incomplete checkbox:
//   • blockers    — mandatory, check-backed requirements that GATE leaving the current stage (blockingReqs).
//   • recommended — the single smartest next action to clear the top blocker, phrased for its owner.
//   • parallel    — forward prep that can SAFELY proceed now even while blocked (e.g. assign a tech / order
//                   gear while awaiting the customer's signature). Never field execution that needs the gate.
// PURE (no DB, no React, no I/O) so it unit-tests with injected facts across every stage. It describes only;
// it performs nothing (Phase 1 is read-only).
import { STAGE_FLOW, MASTER_ORDER, missingReqs, blockingReqs, nextStageOf } from "./stage-flow.js";

export const STAGE_LABEL = {
  inquiry: "Inquiry", site_survey: "Site Survey", proposal: "Proposal", approval_deposit: "Approval & Deposit",
  schedule: "Schedule", install: "Install", qc: "Quality Control", payment: "Payment", completion: "Completion",
};
export const stageLabel = (s) => STAGE_LABEL[s] || String(s || "").replace(/_/g, " ");

// Who owes an internal requirement, by the stage it lives in. Customer-owed is always the customer.
function ownerOf(who, stage) {
  if (who === "customer") return "customer";
  if (["inquiry", "site_survey", "proposal"].includes(stage)) return "sales";
  if (["approval_deposit", "payment", "completion"].includes(stage)) return "office";
  if (stage === "schedule") return "operations";
  if (["install", "qc"].includes(stage)) return "technician";
  return "operations";
}

// The single smartest action to clear a blocker — a nudge when the customer owes it, the step itself when
// the office does. Derived from the requirement label so it tracks STAGE_FLOW with no second source of truth.
function recommendedFor(blocker, stage) {
  if (!blocker) return null;
  if (blocker.who === "customer") {
    const l = blocker.label.toLowerCase();
    const what = /sign/.test(l) ? "sign the agreement"
      : /accept(ed)? (an |the )?(option|proposal)/.test(l) ? "accept a proposal option"
      : /deposit/.test(l) ? "pay the deposit"
      : /balance|paid/.test(l) ? "pay the final balance"
      : /walkthrough|acceptance/.test(l) ? "sign the walkthrough"
      : /confirm/.test(l) ? "confirm the appointment"
      : blocker.label.toLowerCase();
    return { action: `Send a reminder for the customer to ${what}`, owner: "customer", kind: "nudge" };
  }
  return { action: blocker.label, owner: ownerOf("internal", stage), kind: "do" };
}

// Forward prep that is SAFE to start before the current gate clears. Keyed by the current stage; only office/
// ops preparation (assign a tech, finalize the work order, order gear), never field execution that must wait
// on money/sign-off. Surfaced mainly when the blocker is the customer's, so staff aren't idle.
const PREP = {
  inquiry: ["Prepare the site-survey appointment"],
  site_survey: ["Draft the proposal from the survey"],
  proposal: ["Assign a technician", "Finalize the work order", "Order equipment"],
  approval_deposit: ["Assign a technician", "Finalize the work order", "Order equipment"],
  schedule: ["Order equipment", "Confirm the install date with the customer"],
  install: [],
  qc: [],
  payment: ["Prepare the completion documents"],
  completion: [],
};

// The main entry point. `facts` = db.buildStageFacts(accessId) (or the client project object — same field
// names by contract); `assignments` = db.getProjectAssignments(accessId). Returns a structured, role-agnostic
// picture; the caller role-strips + phrases it. No money or payout here — this layer is about the flow.
export function projectIntel(facts, assignments = []) {
  const stage = facts?.stage || "inquiry";
  const blockers = blockingReqs(stage, facts || {}, assignments).map((b) => ({ ...b, owner: ownerOf(b.who, stage) }));
  // Manual, non-gating to-dos at this stage (requirements without a check()). Currently every requirement is
  // check-backed, so this is usually empty — kept so a future advisory requirement surfaces here, not as a blocker.
  const advisories = missingReqs(stage, facts || {}, assignments)
    .filter((m) => !blockers.some((b) => b.label === m.label))
    .map((m) => ({ ...m, owner: ownerOf(m.who, stage) }));
  const top = blockers[0] || null;
  const recommended = recommendedFor(top, stage);
  // Offer parallel prep when we're waiting (there IS a blocker); most valuable when the customer owes it.
  const parallel = blockers.length ? (PREP[stage] || []) : [];
  const owners = Array.from(new Set(blockers.map((b) => b.owner)));

  return {
    stage,
    stageLabel: stageLabel(stage),
    nextStage: nextStageOf(stage),
    nextStageLabel: nextStageOf(stage) ? stageLabel(nextStageOf(stage)) : null,
    blockers,                                   // [{ label, who, owner }] — mandatory, gates advancement
    advisories,                                 // [{ label, who, owner }] — to-do here, not gating
    recommended,                                // { action, owner, kind } | null
    parallel,                                   // [string] — safe prep to start now
    owners,                                     // distinct owners of the current blockers ("whose turn")
    canAdvance: blockers.length === 0,          // the gate is clear
    gateReason: top ? `${top.label} (owner: ${top.owner})` : null,
    waitingOnCustomer: blockers.some((b) => b.who === "customer"),
  };
}
