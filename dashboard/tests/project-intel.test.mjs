// The project intelligence layer is pure, so blocker / recommended / parallel reasoning unit-tests with
// injected facts across stages — no DB. Facts use the same field names as db.buildStageFacts (by contract).
import test from "node:test";
import assert from "node:assert/strict";
import { projectIntel } from "../lib/project-intel.js";

test("distinguishes the blocker, the recommended action, and parallel prep — with owners", () => {
  // The owner's example: in approval, the customer hasn't signed; a tech isn't assigned; gear isn't ordered.
  const facts = { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: false, deposit_submitted: false, deposit_recorded: false };
  const i = projectIntel(facts, []);
  assert.equal(i.stage, "approval_deposit");
  assert.equal(i.canAdvance, false);
  // Blocker = the first mandatory, check-backed requirement — the customer's signature.
  assert.match(i.blockers[0].label, /signed the agreement/i);
  assert.equal(i.blockers[0].owner, "customer");
  assert.equal(i.waitingOnCustomer, true);
  // Recommended = the smartest next action to clear it — a nudge, since the customer owes it.
  assert.match(i.recommended.action, /reminder/i);
  assert.match(i.recommended.action, /sign/i);
  assert.equal(i.recommended.kind, "nudge");
  // Parallel = prep that can safely proceed meanwhile (assign a tech, order gear).
  assert.ok(i.parallel.some((p) => /technician/i.test(p)));
  assert.ok(i.parallel.some((p) => /equipment/i.test(p)));
  // Owners = "whose turn" — both the customer and the office appear.
  assert.ok(i.owners.includes("customer"));
});

test("an internal blocker yields a 'do it' recommendation, owned by the right team", () => {
  // Proposal stage, nothing sent yet → the internal step (send the proposal) is the blocker, owned by sales.
  const facts = { stage: "proposal", proposal_status: "draft" };
  const i = projectIntel(facts, []);
  assert.equal(i.blockers[0].who, "internal");
  assert.equal(i.blockers[0].owner, "sales");
  assert.equal(i.recommended.kind, "do");
});

test("a clear gate reports ready-to-advance, no blocker", () => {
  // Proposal sent AND accepted → the proposal stage's requirements are met.
  const facts = { stage: "proposal", proposal_status: "accepted" };
  const i = projectIntel(facts, []);
  assert.equal(i.canAdvance, true);
  assert.equal(i.blockers.length, 0);
  assert.equal(i.recommended, null);
  assert.equal(i.parallel.length, 0);          // no prep offered when nothing is blocked
  assert.equal(i.nextStage, "approval_deposit");
});

test("schedule stage: tech assignment satisfies the internal requirement", () => {
  const facts = { stage: "schedule", install_confirmed: false };
  const noTech = projectIntel(facts, []);
  assert.ok(noTech.blockers.some((b) => /work order/i.test(b.label)));
  const withTech = projectIntel(facts, [{ role: "tech", user_id: 7 }]);
  assert.ok(!withTech.blockers.some((b) => /work order/i.test(b.label)), "an assigned tech clears that blocker");
});
