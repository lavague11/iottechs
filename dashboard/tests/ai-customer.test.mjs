// Phase 6 (#3) — customer-facing AI allowlist. The customer entry must resolve ONLY its allowlisted reads and
// drop everything else (staff reads, writes, actions, navigation, cross-project). Pure (router-only) so it's
// node-testable. The server action (aiCustomerInterpretAction) adds the role/own-project gate + sanitize on top.
import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_READS, customerReadAllowed, customerReadIntent } from "../lib/ai-customer.js";

test("the allowlist is the customer-safe read set — no staff/internal reads", () => {
  for (const q of ["project_status", "proposal_total", "project_money", "device_coverage", "project_timeline"])
    assert.equal(customerReadAllowed(q), true, q);
  // Staff / internal / cross-project reads are NOT customer-allowed.
  for (const q of ["project_payout", "project_issues", "project_next", "feedback_summary", "projects_by_stage", "awaiting_signature"])
    assert.equal(customerReadAllowed(q), false, q);
});

test("customerReadIntent resolves an allowlisted read from a customer question", () => {
  assert.deepEqual(customerReadIntent("what's going on with my project"), { query: "project_status" });
  assert.equal(customerReadIntent("how much is the proposal")?.query, "proposal_total");
  assert.equal(customerReadIntent("what's my balance")?.query, "project_money");
  assert.equal(customerReadIntent("what does my entrance camera cover")?.query, "device_coverage");
  assert.ok(customerReadIntent("what does my entrance camera cover").ref);   // device read carries the phrase
  assert.equal(customerReadIntent("how long has this been in this stage")?.query, "project_timeline");
});

test("customerReadIntent DROPS staff reads, writes, actions and navigation (allowlist on the resolved intent)", () => {
  assert.equal(customerReadIntent("what's my payout"), null);           // tech pay — never a customer read
  assert.equal(customerReadIntent("any open issues"), null);            // internal flags
  assert.equal(customerReadIntent("what's next"), null);                // internal ops/owners
  assert.equal(customerReadIntent("which projects need QC"), null);     // cross-project staff view
  assert.equal(customerReadIntent("send the proposal"), null);          // an action, not a read
  assert.equal(customerReadIntent("drop the entrance camera"), null);   // a write action
  assert.equal(customerReadIntent("record a $500 deposit"), null);      // a write action
  assert.equal(customerReadIntent("open the proposal"), null);          // navigation
  assert.equal(customerReadIntent(""), null);
});
