// Phase-2 project actions: the pure registry (availability from stage facts + confirm copy) and the 0-token
// phrase router. The apply dispatch + authorization live in ai-actions.js (server) and are covered by the
// authz drift test; here we prove the state-availability gate and the phrase matching.
import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_ACTIONS, ACTION_NAMES, actionFromText, actionAllowed } from "../lib/ai-project-actions.js";
import { routeCommand } from "../lib/ai-command.js";

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
