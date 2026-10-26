// Smart project-status context — the popover half of the top-bar status pill.
//
// The pill's LABEL + navigation already come from one place: the role-branched next-action ladders
// (officeNextAction / customerNextAction) in gateway-client, over the canonical `custFacts`. This
// module adds the CONTEXT the popover needs — the current phase headline and a ✓/○ milestone
// checklist — derived from those SAME facts, so status can never drift from the pill. It invents no
// new state and no new checklist items: every milestone maps to a real fact the flow already gates on.

import { PHASES, masterToPhaseKey } from "./spec.js";
import { MASTER_ORDER } from "./stage-flow.js";

// ====================================================================================================
// ONE canonical project STATUS — "what is happening now / what's the next step", derived from the SAME
// facts the lifecycle already gates on (no second engine, no new checklist). A single state enum feeds
// two presentations: admin (operational) and customer (plain state OR an action CTA). Milestones remain
// underlying facts/history — the visible status is the CURRENT actionable state, nothing else.
//
// Priority = earliest UNMET prerequisite wins, so a later fact never hides an unresolved earlier one
// (signed-but-unpaid reads AWAITING_DEPOSIT, not COMPLETE). Run it on floored facts (stageFloorFacts)
// so a late project with sparse granular records doesn't regress to an early step.
// ====================================================================================================

// Canonical states, in lifecycle order. Exceptions (CHANGES_REQUESTED, CLOSED_NOT_COMPLETED) are woven
// into the same chain. Keep this list minimal — one state per "what is the next operational step".
export const PROJECT_STATES = [
  "INTAKE", "BUILD_SURVEY", "AWAITING_SURVEY_APPROVAL", "CREATE_PROPOSAL", "SEND_PROPOSAL",
  "AWAITING_SIGNATURE", "CHANGES_REQUESTED", "AWAITING_DEPOSIT", "READY_TO_SCHEDULE",
  "INSTALL_SCHEDULED", "INSTALL_IN_PROGRESS", "AWAITING_FINAL_PAYMENT", "COMPLETE",
  "CLOSED_NOT_COMPLETED",
];

// Derive the ONE current state from canonical facts (never from UI labels). `stage` is the project's
// master stage, used only to tell INSTALL_IN_PROGRESS (field work started) from INSTALL_SCHEDULED.
export function resolveProjectStatus(f = {}, stage = null) {
  if (f.closed_not_completed) return "CLOSED_NOT_COMPLETED";

  // --- Terminal: field work done → money decides COMPLETE vs AWAITING_FINAL_PAYMENT ---
  const workDone = !!f.install_done || !!f.completed || !!f.completed_at || stage === "qc" || stage === "payment" || stage === "completion";
  if (workDone) {
    const balanceDue = typeof f.balance_due === "number" ? f.balance_due > 0 : !(f.final_paid || f.final_balance_paid);
    // Before the final payment is in, the owner's canonical primary state is AWAITING_FINAL_PAYMENT.
    return balanceDue ? "AWAITING_FINAL_PAYMENT" : "COMPLETE";
  }

  // --- Forward chain: the FIRST unmet prerequisite is the current state ---
  const surveyRequired = f.survey_required !== false && !f.survey_skipped;
  const surveySatisfied = !!f.survey_done || !!f.survey_skipped;
  if (surveyRequired && !surveySatisfied) {
    return (f.survey_submitted && !f.survey_done) ? "AWAITING_SURVEY_APPROVAL" : "BUILD_SURVEY";
  }
  const accepted = f.proposal_status === "accepted" || !!f.proposal_signed;
  if (!accepted) {
    if (!f.proposal_status || f.proposal_status === "draft") {
      return f.proposal_status === "draft" ? "SEND_PROPOSAL" : "CREATE_PROPOSAL";
    }
    if (f.proposal_status === "changes_requested") return "CHANGES_REQUESTED";
    return "AWAITING_SIGNATURE";                       // "sent" — published, awaiting the customer
  }
  if (!f.proposal_signed) return "AWAITING_SIGNATURE";  // accepted an option but not yet signed
  const depositRequired = f.deposit_required !== false;
  if (depositRequired && !f.deposit_recorded) return "AWAITING_DEPOSIT";

  // --- Signed + deposit cleared (or none) → scheduling / install ---
  if (stage === "install") return "INSTALL_IN_PROGRESS";
  if (f.install_date || f.install_confirmed) return "INSTALL_SCHEDULED";
  return "READY_TO_SCHEDULE";
}

// Admin = the operational state, verbatim on the chip (no "STATUS ▾"). An install date, when known,
// is appended by the caller ("Installation Scheduled · Nov 4").
export const ADMIN_STATUS = {
  INTAKE:                 { label: "Customer Contact",      tone: "neutral" },
  BUILD_SURVEY:           { label: "Build Site Survey",     tone: "neutral" },
  AWAITING_SURVEY_APPROVAL:{ label: "Awaiting Survey",      tone: "gold" },
  CREATE_PROPOSAL:        { label: "Create Proposal",       tone: "neutral" },
  SEND_PROPOSAL:          { label: "Send Proposal",         tone: "neutral" },
  AWAITING_SIGNATURE:     { label: "Awaiting Signature",    tone: "gold" },
  CHANGES_REQUESTED:      { label: "Changes Requested",     tone: "gold" },
  AWAITING_DEPOSIT:       { label: "Awaiting Deposit",      tone: "gold" },
  READY_TO_SCHEDULE:      { label: "Ready to Schedule",     tone: "neutral" },
  INSTALL_SCHEDULED:      { label: "Installation Scheduled",tone: "green" },
  INSTALL_IN_PROGRESS:    { label: "Installation In Progress", tone: "neutral" },
  AWAITING_FINAL_PAYMENT: { label: "Awaiting Final Payment",tone: "gold" },
  COMPLETE:               { label: "Complete",              tone: "green" },
  CLOSED_NOT_COMPLETED:   { label: "Closed · Not Completed",tone: "red" },
};

// Customer = the SAME state, in their language. `cta: true` = the customer owes the next move (the chip
// becomes an action link); otherwise it's a plain, read-only state. Never internal/operational wording.
export const CUSTOMER_STATUS = {
  INTAKE:                 { label: "Getting Started",         cta: false, tone: "neutral" },
  BUILD_SURVEY:           { label: "Site Survey",             cta: false, tone: "neutral" },
  AWAITING_SURVEY_APPROVAL:{ label: "Approve Site Survey",    cta: true,  tone: "gold" },
  CREATE_PROPOSAL:        { label: "Awaiting Proposal",       cta: false, tone: "neutral" },
  SEND_PROPOSAL:          { label: "Awaiting Proposal",       cta: false, tone: "neutral" },
  AWAITING_SIGNATURE:     { label: "Review & Sign Proposal",  cta: true,  tone: "gold" },
  CHANGES_REQUESTED:      { label: "Awaiting Proposal",       cta: false, tone: "neutral" },
  AWAITING_DEPOSIT:       { label: "Pay Deposit",             cta: true,  tone: "gold" },
  READY_TO_SCHEDULE:      { label: "Awaiting Installation",   cta: false, tone: "neutral" },
  INSTALL_SCHEDULED:      { label: "Installation Scheduled",  cta: false, tone: "green" },
  INSTALL_IN_PROGRESS:    { label: "Installation In Progress",cta: false, tone: "neutral" },
  AWAITING_FINAL_PAYMENT: { label: "Final Payment Due",       cta: true,  tone: "gold" },
  COMPLETE:               { label: "Complete",                cta: false, tone: "green" },
  CLOSED_NOT_COMPLETED:   { label: "Closed",                  cta: false, tone: "neutral" },
};

export const statusToneHex = (tone) => (tone === "green" ? "#2E7D5B" : tone === "gold" ? "#C9A96E" : tone === "red" ? "#C4553D" : "#3E6C9E");

// Popover context (admin): the just-completed milestone, the current gap, and the next operational step —
// the state-first replacement for the old 5-item checklist. One line of history, one line of "now".
export const STATE_DETAIL = {
  INTAKE:                 { done: null,                pending: "Setting up the project",        next: "Build the site survey" },
  BUILD_SURVEY:           { done: null,                pending: "Site survey not built",         next: "Build the site survey" },
  AWAITING_SURVEY_APPROVAL:{ done: "Site survey sent", pending: "Awaiting customer approval",     next: "Awaiting the customer" },
  CREATE_PROPOSAL:        { done: "Site survey done",  pending: "No proposal yet",               next: "Create the proposal" },
  SEND_PROPOSAL:          { done: "Proposal drafted",  pending: "Not sent to the customer",      next: "Send the proposal" },
  AWAITING_SIGNATURE:     { done: "Proposal sent",     pending: "Awaiting customer signature",   next: "Request the signature" },
  CHANGES_REQUESTED:      { done: "Customer reviewed", pending: "Changes requested",             next: "Revise the proposal" },
  AWAITING_DEPOSIT:       { done: "Proposal signed",   pending: "Deposit not yet received",      next: "Record the deposit" },
  READY_TO_SCHEDULE:      { done: "Deposit received",  pending: "Installation not scheduled",    next: "Schedule the installation" },
  INSTALL_SCHEDULED:      { done: "Installation booked",pending: "Awaiting the install date",     next: "Run the installation" },
  INSTALL_IN_PROGRESS:    { done: "Install started",   pending: "Field work in progress",        next: "Complete the installation" },
  AWAITING_FINAL_PAYMENT: { done: "Installation done", pending: "Final balance due",             next: "Record the final payment" },
  COMPLETE:               { done: "Balance settled",   pending: null,                            next: null },
  CLOSED_NOT_COMPLETED:   { done: null,                pending: "Closed — not completed",        next: null },
};

// Assemble the admin popover payload from the canonical state + the ladder's already-resolved routing
// action (label/target/spot/schedule/muted). State-first: the current state is the headline; one ✓ done
// line, one ○ pending line, and the next operational step — never the whole lifecycle.
export function projectStatusView(state, action = null) {
  const a = ADMIN_STATUS[state] || ADMIN_STATUS.INTAKE;
  const d = STATE_DETAIL[state] || {};
  const spot = action?.spot || a.label;
  const ctaLabel = action?.schedule ? "Open scheduling"
    : action?.muted ? `View ${spot}`
    : action ? `Continue to ${spot}` : `View ${a.label}`;
  return {
    stateLabel: a.label,
    tone: a.tone,
    done: d.done || null,
    pending: d.pending || null,
    // An actionable next step shows its own verb; a muted "waiting" action shows the operational next step
    // instead of repeating the state (e.g. "Request the signature", not "Awaiting signature" again).
    nextLabel: (action && !action.muted && action.label) ? action.label : (d.next || null),
    action: !!action && !action.muted,
    ctaLabel,
  };
}

// A project's stage is only reached by satisfying every earlier stage's requirements (advancement is
// fact-gated), so a later stage is proof the earlier milestones are done — even when the granular
// fact record is sparse (legacy/seed rows). This floors the facts to the project's real position so
// the pill + checklist never regress to "Build proposal" on a completed job. It never floors the
// CURRENT stage's own owed items (those stay fact-driven), so a live action is never hidden.
export function stageFloorFacts(f = {}, stageKey) {
  const i = MASTER_ORDER.indexOf(stageKey);
  if (i < 0) return f;
  const past = (key) => i >= MASTER_ORDER.indexOf(key);
  const out = { ...f };
  if (past("proposal")) {                    // reached proposal ⇒ survey (and any mockup) approved
    out.survey_ok = out.survey_done = out.survey_accepted = out.survey_submitted = true;
    if (out.mockup_has || out.mockup_submitted || out.mockup_done) out.mockup_done = out.mockup_submitted = true;
  }
  if (past("approval_deposit")) out.proposal_status = "accepted";   // reached approval ⇒ a proposal was accepted
  if (past("schedule")) {                    // past approval ⇒ signed + deposit cleared
    out.proposal_status = "accepted";
    out.proposal_signed = out.deposit_submitted = out.deposit_recorded = true;
  }
  return out;
}

// The phase headline for a master stage key → { label, statusWord } (e.g. "Proposal" / "Reviewing").
export function phaseHeadline(stageKey) {
  const ph = PHASES.find((p) => p.key === masterToPhaseKey(stageKey)) || PHASES[0];
  return { label: ph.label, statusWord: ph.status };
}

// The getting-started milestone chain, in order, each resolved done/not-done from canonical facts.
// The first not-done item is flagged `active` (the "○ pending — you are here" marker). Mockup only
// appears when the project actually has one. Deliberately stops at the deposit — beyond that the
// stage/label carries the story (scheduling, install), and the remaining facts aren't all present
// here, so adding them would risk a false ✓ (e.g. install_date falls back to the survey date).
export function statusMilestones(f = {}) {
  const raw = [["Site survey", !!f.survey_done || !!f.survey_skipped]];
  if (f.mockup_has || f.mockup_done || f.mockup_submitted) raw.push(["Mockup", !!f.mockup_done]);
  raw.push(["Proposal accepted", f.proposal_status === "accepted"]);
  raw.push(["Agreement signed", !!f.proposal_signed]);
  raw.push(["Deposit paid", !!f.deposit_recorded]);
  const firstPending = raw.findIndex(([, done]) => !done);
  return raw.map(([label, done], i) => ({ label, done, active: i === firstPending }));
}

// Assemble the full popover payload from the facts + the ladder's already-resolved next action.
// `action` = { label, target, spot, muted, schedule } | null (from office/customerNextAction).
// Returns null only when there's genuinely nothing to show (no stage yet).
export function projectStatusDetail(stageKey, facts = {}, action = null) {
  if (!stageKey) return null;
  const head = phaseHeadline(stageKey);
  const milestones = statusMilestones(facts);
  // The primary-button verb: an owed action "continues", a waiting/complete status just "views".
  const spot = action?.spot || head.label;
  const ctaLabel = action?.schedule ? "Open scheduling"
    : action?.muted ? `View ${spot}`
    : action ? `Continue to ${spot}` : `View ${head.label}`;
  return {
    phaseLabel: head.label,
    statusWord: head.statusWord,          // the broad phase word (Pending / Reviewing / In Progress …)
    nextLabel: action?.label || null,     // the specific owed action / waiting state (Next step line)
    action: !!action && !action.muted,
    milestones,
    ctaLabel,
  };
}
