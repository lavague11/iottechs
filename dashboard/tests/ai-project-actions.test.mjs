// Phase-2 project actions: the pure registry (availability from stage facts + confirm copy) and the 0-token
// phrase router. The apply dispatch + authorization live in ai-actions.js (server) and are covered by the
// authz drift test; here we prove the state-availability gate and the phrase matching.
import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_ACTIONS, ACTION_NAMES, actionFromText, actionAllowed, parsePayment, parseAssign, detectAction } from "../lib/ai-project-actions.js";
import { routeCommand } from "../lib/ai-command.js";
import { MASTER_ORDER } from "../lib/stage-flow.js";

test("send_proposal is available only for a DRAFT proposal — not missing, not already sent", () => {
  const a = PROJECT_ACTIONS.send_proposal;
  assert.equal(a.available({ proposal_status: "draft" }).ok, true);
  assert.equal(a.available({ proposal_status: null }).ok, false);
  assert.match(a.available({ proposal_status: null }).why, /isn't a proposal/i);
  assert.equal(a.available({ proposal_status: "sent" }).ok, false);
  assert.match(a.available({ proposal_status: "sent" }).why, /already been sent/i);
  assert.equal(a.available({ proposal_status: "accepted" }).ok, false);
});

test("confirm copy shows WHO it goes to and the amount (so the human knows what they're approving)", () => {
  const c = PROJECT_ACTIONS.send_proposal.confirm({ name: "Crazy Cars", email: "owner@crazycars.com", total: "$27,130.50" });
  assert.match(c.title, /Send Crazy Cars'?s proposal to the customer/);
  assert.match(c.detail, /owner@crazycars\.com/);     // recipient shown
  assert.match(c.detail, /\$27,130\.50/);             // amount shown
  // Degrades gracefully with no email/total.
  assert.match(PROJECT_ACTIONS.send_proposal.confirm({ name: "X" }).detail, /the customer/);
});

test("per-action permission: editor is necessary AND a per-action cap is required — one action never implies another", () => {
  // send_proposal has no extra cap → an editor is allowed even if can() denies everything.
  assert.equal(actionAllowed("send_proposal", { editor: true, can: () => false }), true);
  // a non-editor is always refused.
  assert.equal(actionAllowed("send_proposal", { editor: false, can: () => true }), false);
  // a hypothetical capped action proves the mechanism: cap must be satisfied even for an editor.
  const saved = PROJECT_ACTIONS.send_proposal.cap;
  PROJECT_ACTIONS.send_proposal.cap = "install.pay.edit";
  try {
    assert.equal(actionAllowed("send_proposal", { editor: true, can: (c) => c === "stage.move" }), false, "editor without the specific cap is refused");
    assert.equal(actionAllowed("send_proposal", { editor: true, can: (c) => c === "install.pay.edit" }), true, "editor with the cap is allowed");
  } finally { PROJECT_ACTIONS.send_proposal.cap = saved; }
  assert.equal(actionAllowed("nonexistent", { editor: true, can: () => true }), false);
});

test("actionFromText maps natural phrasings to send_proposal, and leaves non-actions alone", () => {
  for (const p of ["send the proposal", "send proposal to the customer", "go ahead and send the proposal", "send it to the customer", "can you send the quote"]) {
    assert.equal(actionFromText(p), "send_proposal", p);
  }
  assert.equal(actionFromText("how much is the proposal"), null);
  assert.equal(actionFromText("open the proposal"), null);
  assert.ok(ACTION_NAMES.includes("send_proposal"));
});

test("the router returns a confirmable action intent (not an edit) for 'send the proposal'", () => {
  assert.deepEqual(routeCommand("send the proposal"), { type: "action", name: "send_proposal", target: "this" });
});

test("2.2 request_signature: available only for a SENT, unsigned proposal", () => {
  const a = PROJECT_ACTIONS.request_signature;
  assert.equal(a.available({ proposal_status: "sent", proposal_signed: false }).ok, true);
  assert.equal(a.available({ proposal_status: "accepted", proposal_signed: false }).ok, true);
  assert.equal(a.available({ proposal_status: "draft" }).ok, false);
  assert.match(a.available({ proposal_status: "draft" }).why, /hasn't been sent/i);
  assert.equal(a.available({ proposal_status: "accepted", proposal_signed: true }).ok, false);
  assert.match(a.available({ proposal_status: "accepted", proposal_signed: true }).why, /already signed/i);
  assert.match(a.confirm({ name: "Crazy Cars", email: "o@c.com" }).detail, /review and sign/i);
});

test("2.2 router + phrases map to request_signature", () => {
  assert.equal(actionFromText("request a signature"), "request_signature");
  assert.equal(actionFromText("remind the customer to sign"), "request_signature");
  assert.equal(actionFromText("send a signature reminder"), "request_signature");
  assert.deepEqual(routeCommand("remind the customer to sign"), { type: "action", name: "request_signature", target: "this" });
  assert.equal(actionFromText("sign in"), null);   // not a signature request
});

test("2.6 advance_stage: gate-aware + TYPE-AWARE next stage (matches what setStage accepts)", () => {
  const a = PROJECT_ACTIONS.advance_stage;
  const full = { order: MASTER_ORDER };
  const clear = a.available({ stage: "proposal", proposal_status: "accepted" }, [], full);
  assert.equal(clear.ok, true);
  assert.equal(clear.data.nextStage, "approval_deposit");                 // full flow successor
  assert.equal(a.confirm({ name: "Crazy Cars", nextLabel: "Approval & Deposit" }).title, "Advance Crazy Cars to Approval & Deposit");
  const blocked = a.available({ stage: "proposal", proposal_status: "draft" }, [], full);
  assert.equal(blocked.ok, false);
  assert.match(blocked.why, /blocked on/i);
  assert.equal(a.available({ stage: "completion", completion_docs: true }, [], full).ok, false);   // final stage
  // TYPE-AWARE: a reduced-stage flow (Type C skips survey/proposal/approval) → next is its OWN successor,
  // never a stage setStage would reject. No order → reports "final stage" rather than guessing MASTER_ORDER.
  const typeC = { order: ["inquiry", "schedule", "install", "qc", "payment", "completion"] };
  assert.equal(a.available({ stage: "inquiry", date: "2026-01-01" }, [], typeC).data.nextStage, "schedule");
  assert.equal(a.available({ stage: "proposal", proposal_status: "accepted" }, [], {}).ok, false);   // unknown order → final-stage, never a wrong guess
});

test("2.6 per-action cap keeps stage moves to admin/manager — a salesperson (editor, no stage.move) is refused", () => {
  assert.equal(PROJECT_ACTIONS.advance_stage.cap, "stage.move");
  assert.equal(actionAllowed("advance_stage", { editor: true, can: (c) => c === "stage.move" }), true);    // admin/manager
  assert.equal(actionAllowed("advance_stage", { editor: true, can: () => false }), false);                  // sales: editor but no stage.move
  assert.deepEqual(routeCommand("move it to the next stage"), { type: "action", name: "advance_stage", target: "this" });
});

test("2.3 record_payment: parses amount + DB kind + clean label; needs a verb (not plain money talk)", () => {
  assert.deepEqual(parsePayment("record a $1,530 deposit"), { amount: 1530, kind: "deposit", label: "deposit" });
  assert.deepEqual(parsePayment("log a payment of 500"), { amount: 500, kind: "partial", label: "payment" });            // generic → DB "partial"
  assert.deepEqual(parsePayment("mark the final balance 2,750.50 paid"), { amount: 2750.5, kind: "final", label: "final balance" });  // balance → DB "final"
  // $-anchored amount wins over a leading non-money number (the money mis-parse fix).
  assert.equal(parsePayment("record invoice 7 for $500 deposit").amount, 500);
  assert.equal(parsePayment("how much is the balance"), null);          // a question, not a command
  assert.equal(parsePayment("the deposit is 1530"), null);              // no record/log verb → not a command
  assert.equal(parsePayment("record a note"), null);                    // no amount
  // Router carries the args; the confirm shows the EXACT amount + label; records money, never charges a card.
  assert.deepEqual(routeCommand("record a $1,530 deposit"), { type: "action", name: "record_payment", args: { amount: 1530, kind: "deposit", label: "deposit" }, target: "this" });
  assert.deepEqual(detectAction("send the proposal"), { name: "send_proposal" });
  const c = PROJECT_ACTIONS.record_payment.confirm({ name: "Crazy Cars" }, { amount: 1530, label: "deposit" });
  assert.match(c.title, /Record a \$1,530\.00 deposit for Crazy Cars/);
  assert.match(c.detail, /does not charge a card/i);
});

test("2.3 record_payment cap = install.pay.edit — admin/manager only; a salesperson is refused", () => {
  assert.equal(PROJECT_ACTIONS.record_payment.cap, "install.pay.edit");
  assert.equal(actionAllowed("record_payment", { editor: true, can: (c) => c === "install.pay.edit" }), true);   // admin/manager
  assert.equal(actionAllowed("record_payment", { editor: true, can: () => false }), false);                       // sales: editor but no install.pay.edit
  // available only against a sent proposal (not a draft).
  assert.equal(PROJECT_ACTIONS.record_payment.available({ proposal_status: "sent" }).ok, true);
  assert.equal(PROJECT_ACTIONS.record_payment.available({ proposal_status: "draft" }).ok, false);
});

test("2.4 assign_tech: extracts the tech name; router carries it; cap=assignment.edit (admin/manager only)", () => {
  assert.deepEqual(parseAssign("assign Jess to this project"), { techName: "Jess" });
  assert.deepEqual(parseAssign("put Mike on this job"), { techName: "Mike" });
  assert.deepEqual(parseAssign("assign technician Sarah Lee"), { techName: "Sarah Lee" });
  assert.equal(parseAssign("assign it to me"), null);            // filler, not a name
  assert.equal(parseAssign("how is the project"), null);
  assert.deepEqual(routeCommand("assign Jess to this"), { type: "action", name: "assign_tech", args: { techName: "Jess" }, target: "this" });
  assert.equal(PROJECT_ACTIONS.assign_tech.cap, "assignment.edit");
  assert.equal(actionAllowed("assign_tech", { editor: true, can: (c) => c === "assignment.edit" }), true);   // admin/manager
  assert.equal(actionAllowed("assign_tech", { editor: true, can: () => false }), false);                      // sales refused
  assert.match(PROJECT_ACTIONS.assign_tech.confirm({ name: "Crazy Cars" }, { resolvedName: "Jess Tech" }).title, /Assign Jess Tech to Crazy Cars/);
});
