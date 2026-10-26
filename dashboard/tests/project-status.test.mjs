// ONE canonical project status — current state + next action, derived from facts (never UI labels).
// Covers the resolver priority matrix and that admin / customer render the SAME state differently.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProjectStatus, ADMIN_STATUS, CUSTOMER_STATUS, PROJECT_STATES, projectStatusView } from "../lib/project-status.js";

const st = (f, stage) => resolveProjectStatus(f, stage);

test("A–D: survey → proposal → send → signature chain, first unmet step wins", () => {
  assert.equal(st({ survey_required: true }), "BUILD_SURVEY");                                        // A
  assert.equal(st({ survey_submitted: true }), "AWAITING_SURVEY_APPROVAL");                           // survey out, awaiting approve
  assert.equal(st({ survey_done: true }), "CREATE_PROPOSAL");                                         // B: survey done, no proposal
  assert.equal(st({ survey_done: true, proposal_status: "draft" }), "SEND_PROPOSAL");                 // C: draft
  assert.equal(st({ survey_done: true, proposal_status: "sent" }), "AWAITING_SIGNATURE");             // D: published, unsigned
  assert.equal(st({ survey_skipped: true, proposal_status: "sent" }), "AWAITING_SIGNATURE");          // skipped survey still flows
});

test("E–G: signature → deposit → schedule; a later fact never hides an unmet prerequisite", () => {
  // E: signed + deposit required unpaid → AWAITING_DEPOSIT (not COMPLETE / scheduled)
  assert.equal(st({ survey_done: true, proposal_status: "accepted", proposal_signed: true, deposit_recorded: false }), "AWAITING_DEPOSIT");
  // F: signed + NO deposit required → READY_TO_SCHEDULE
  assert.equal(st({ survey_done: true, proposal_signed: true, deposit_required: false }), "READY_TO_SCHEDULE");
  // G: deposit paid, nothing scheduled → READY_TO_SCHEDULE
  assert.equal(st({ survey_done: true, proposal_signed: true, deposit_recorded: true }), "READY_TO_SCHEDULE");
  // Prerequisite guard: install date set but deposit still unpaid → still AWAITING_DEPOSIT
  assert.equal(st({ survey_done: true, proposal_signed: true, deposit_recorded: false, install_date: "2026-11-04" }), "AWAITING_DEPOSIT");
});

test("H–K: install scheduled → in progress → final payment → complete", () => {
  const base = { survey_done: true, proposal_signed: true, deposit_recorded: true };
  assert.equal(st({ ...base, install_date: "2026-11-04" }), "INSTALL_SCHEDULED");                     // H
  assert.equal(st({ ...base, install_date: "2026-11-04" }, "install"), "INSTALL_IN_PROGRESS");        // I: stage install
  assert.equal(st({ ...base, install_done: true, balance_due: 607.77 }), "AWAITING_FINAL_PAYMENT");   // J: work done + balance
  assert.equal(st({ ...base, install_done: true, balance_due: 0 }), "COMPLETE");                      // K: work done + paid
  assert.equal(st({ ...base, completed_at: "2026-11-10", final_paid: true }), "COMPLETE");            // completion + paid
});

test("changes-requested and closed are woven into the same chain", () => {
  assert.equal(st({ survey_done: true, proposal_status: "changes_requested" }), "CHANGES_REQUESTED");
  assert.equal(st({ survey_done: true, proposal_signed: true, deposit_recorded: true, install_done: true, closed_not_completed: true }), "CLOSED_NOT_COMPLETED");
});

test("L: an unsent staff revision does NOT regress the status — facts reflect the PUBLISHED proposal", () => {
  // The caller feeds the resolver the published proposal's facts (sent, unsigned). A working draft that
  // exists only for staff never changes these facts, so the state stays AWAITING_SIGNATURE for v1.
  const publishedFacts = { survey_done: true, proposal_status: "sent", proposal_signed: false };
  assert.equal(st(publishedFacts), "AWAITING_SIGNATURE");
  // Admin may show secondary "N unsent changes" context separately — but the STATE is unchanged.
});

test("M + mapping: every state renders for BOTH audiences; same state, different words", () => {
  for (const s of PROJECT_STATES) {
    assert.ok(ADMIN_STATUS[s]?.label, `admin label for ${s}`);
    assert.ok(CUSTOMER_STATUS[s]?.label, `customer label for ${s}`);
  }
  // The owner's admin↔customer contrasts.
  assert.equal(ADMIN_STATUS.AWAITING_SIGNATURE.label, "Awaiting Signature");
  assert.equal(CUSTOMER_STATUS.AWAITING_SIGNATURE.label, "Review & Sign Proposal");
  assert.equal(CUSTOMER_STATUS.AWAITING_SIGNATURE.cta, true);
  assert.equal(ADMIN_STATUS.AWAITING_DEPOSIT.label, "Awaiting Deposit");
  assert.equal(CUSTOMER_STATUS.AWAITING_DEPOSIT.label, "Pay Deposit");
  assert.equal(CUSTOMER_STATUS.AWAITING_DEPOSIT.cta, true);
  // Same facts, different audience: admin = Ready to Schedule, customer = Awaiting Installation.
  assert.equal(ADMIN_STATUS.READY_TO_SCHEDULE.label, "Ready to Schedule");
  assert.equal(CUSTOMER_STATUS.READY_TO_SCHEDULE.label, "Awaiting Installation");
  assert.equal(CUSTOMER_STATUS.READY_TO_SCHEDULE.cta, false);
  assert.equal(ADMIN_STATUS.AWAITING_FINAL_PAYMENT.label, "Awaiting Final Payment");
  assert.equal(CUSTOMER_STATUS.AWAITING_FINAL_PAYMENT.label, "Final Payment Due");
  assert.equal(CUSTOMER_STATUS.AWAITING_FINAL_PAYMENT.cta, true);
  // A customer is never told to do internal work.
  assert.equal(CUSTOMER_STATUS.CREATE_PROPOSAL.cta, false);
  assert.equal(CUSTOMER_STATUS.READY_TO_SCHEDULE.cta, false);
});

test("projectStatusView: state-first popover — headline state, ✓done/○now, next step (not a checklist)", () => {
  // Muted 'waiting' action → NEXT is the operational step, not a repeat of the state.
  const waiting = projectStatusView("AWAITING_SIGNATURE", { label: "Awaiting signature", spot: "Proposal", muted: true });
  assert.equal(waiting.stateLabel, "Awaiting Signature");
  assert.equal(waiting.done, "Proposal sent");
  assert.equal(waiting.pending, "Awaiting customer signature");
  assert.equal(waiting.nextLabel, "Request the signature");          // not "Awaiting signature"
  assert.equal(waiting.ctaLabel, "View Proposal");
  assert.equal(waiting.action, false);
  // Actionable action → its own verb + a "Continue to" CTA.
  const act = projectStatusView("AWAITING_DEPOSIT", { label: "Record deposit", spot: "Approval & Deposit" });
  assert.equal(act.nextLabel, "Record deposit");
  assert.equal(act.action, true);
  assert.equal(act.ctaLabel, "Continue to Approval & Deposit");
});

test("milestones remain history, not the primary status (the state answers 'now')", () => {
  // 'accepted' alone (milestone) is not a status — the state advances to what's owed NEXT.
  assert.equal(st({ survey_done: true, proposal_status: "accepted", proposal_signed: false }), "AWAITING_SIGNATURE");
  assert.notEqual(st({ survey_done: true, proposal_signed: true, deposit_recorded: true }), "AWAITING_DEPOSIT");
});
