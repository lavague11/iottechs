// Phase 6 (#3) — customer-facing AI allowlist. The customer entry must resolve ONLY its allowlisted reads and
// drop everything else (staff reads, writes, actions, navigation, cross-project). Pure (router-only) so it's
// node-testable. The server action (aiCustomerInterpretAction) adds the role/own-project gate + sanitize on top.
import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_READS, customerReadAllowed, customerReadIntent, customerActionIntent } from "../lib/ai-customer.js";

test("the allowlist is the customer-safe read set — no staff/internal reads", () => {
  for (const q of ["project_status", "proposal_total", "project_money", "device_coverage", "project_timeline",
    "explain_item", "compare_options", "explain_terms"])   // #6 explain-the-quote reads are customer-safe
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

test("#3 slice 3 customerActionIntent: comment = the one write; sign/pay = guided nav; nothing else", () => {
  // Comment (the one true write) — explicit relay phrasing + a message.
  assert.deepEqual(customerActionIntent("leave a comment: the back gate code is 1234"), { kind: "comment", body: "the back gate code is 1234" });
  assert.deepEqual(customerActionIntent("tell the team the alarm panel is in the closet"), { kind: "comment", body: "the alarm panel is in the closet" });
  // Deliberate acts → guided navigation (the AI never performs them).
  assert.equal(customerActionIntent("I'm ready to sign the proposal")?.kind, "nav");
  assert.match(customerActionIntent("I'm ready to sign the proposal").label, /sign/i);
  assert.equal(customerActionIntent("how do I pay my deposit")?.kind, "nav");
  assert.match(customerActionIntent("how do I pay my deposit").label, /payment/i);
  assert.equal(customerActionIntent("pay the balance")?.kind, "nav");
  // Not an action — questions/reads are left to the read allowlist, not swallowed here.
  assert.equal(customerActionIntent("what's my balance"), null);
  assert.equal(customerActionIntent("tell me my balance"), null);   // "tell me" is not a relay lead-in
  assert.equal(customerActionIntent("how's my project"), null);
  assert.equal(customerActionIntent(""), null);
});

test("#6 customerReadIntent resolves the explain-the-quote reads", () => {
  assert.equal(customerReadIntent("what's the nvr")?.query, "explain_item");
  assert.ok(customerReadIntent("what's the nvr").ref);                       // carries the phrase for the glossary
  assert.equal(customerReadIntent("what does the labor cover")?.query, "explain_item");
  assert.equal(customerReadIntent("what's the difference between the options")?.query, "compare_options");
  assert.equal(customerReadIntent("how does the deposit work")?.query, "explain_terms");
  assert.equal(customerReadIntent("what's the pcp credit")?.query, "explain_terms");
});

test("#7 customerActionIntent: an objection/change-request → a captured concern (device resolved server-side)", () => {
  // The headline — a device-need objection.
  const o = customerActionIntent("I'm not sure we need the entrance camera");
  assert.equal(o?.kind, "objection");
  assert.equal(o.feedbackKind, "objection:need");
  assert.match(o.body, /entrance camera/i);
  assert.equal(o.ref, "I'm not sure we need the entrance camera");          // full phrase → server resolves the device
  // A change-request to drop gear is a captured concern, never an executed change.
  assert.equal(customerActionIntent("can we drop the lobby camera")?.kind, "objection");
  assert.equal(customerActionIntent("that seems like too many cameras")?.kind, "objection");
  assert.equal(customerActionIntent("this is too expensive")?.feedbackKind, "objection:price");
  // A plain relay comment is still a comment, not an objection; a neutral question is neither.
  assert.equal(customerActionIntent("tell the team the gate code is 1234")?.kind, "comment");
  assert.equal(customerActionIntent("what's my balance"), null);
  // Deliberate acts still win over the objection branch (ordered first).
  assert.equal(customerActionIntent("I'm ready to sign the proposal")?.kind, "nav");
});
