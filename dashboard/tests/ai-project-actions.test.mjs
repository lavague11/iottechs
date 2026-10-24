// Phase-2 project actions: the pure registry (availability from stage facts + confirm copy) and the 0-token
// phrase router. The apply dispatch + authorization live in ai-actions.js (server) and are covered by the
// authz drift test; here we prove the state-availability gate and the phrase matching.
import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_ACTIONS, ACTION_NAMES, actionFromText, actionAllowed, parsePayment, parseAssign, parseAdjudicate, parseRaiseIssue, reasonFromText, parseProposeChange, parseRemoveLine, detectAction } from "../lib/ai-project-actions.js";
import { routeCommand, applyIntentToPayload } from "../lib/ai-command.js";
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

test("2.5 adjudicate_issue: parses resolve/dismiss + optional id; needs an issue NOUN (not loose 'resolve' talk)", () => {
  assert.deepEqual(parseAdjudicate("resolve the issue"), { decision: "resolve" });
  assert.deepEqual(parseAdjudicate("close out the flag"), { decision: "resolve" });
  assert.deepEqual(parseAdjudicate("mark issue 12 resolved"), { decision: "resolve", issueId: 12 });
  assert.deepEqual(parseAdjudicate("dismiss the flag"), { decision: "dismiss" });
  assert.deepEqual(parseAdjudicate("dismiss issue #7"), { decision: "dismiss", issueId: 7 });
  assert.equal(parseAdjudicate("resolve the dispute with the customer"), null); // no issue/flag noun
  assert.equal(parseAdjudicate("how many open issues"), null);                  // a question, no verb
  // Status QUESTIONS must NOT produce a confirmable close card (interrogative lead or trailing "?").
  assert.equal(parseAdjudicate("is the issue resolved?"), null);
  assert.equal(parseAdjudicate("did we resolve the issue"), null);
  assert.equal(parseAdjudicate("has issue 12 been resolved"), null);
  assert.deepEqual(parseAdjudicate("resolve these issues"), { decision: "resolve" });   // plural imperative still fires
  // Router carries the args; detectAction surfaces it.
  assert.deepEqual(routeCommand("dismiss issue 7"), { type: "action", name: "adjudicate_issue", args: { decision: "dismiss", issueId: 7 }, target: "this" });
  assert.deepEqual(detectAction("resolve the issue"), { name: "adjudicate_issue", args: { decision: "resolve" } });
});

test("2.5 adjudicate_issue: available only when an open flag exists; cap=issue.adjudicate (admin/manager only)", () => {
  const a = PROJECT_ACTIONS.adjudicate_issue;
  assert.equal(a.available({}, [], { openIssues: [{ id: 1, status: "NEEDS_REVIEW" }] }).ok, true);
  assert.equal(a.available({}, [], { openIssues: [] }).ok, false);
  assert.match(a.available({}, [], { openIssues: [] }).why, /no open issues/i);
  assert.equal(a.available({}, [], {}).ok, false);           // no issues threaded → nothing to close
  assert.equal(a.cap, "issue.adjudicate");
  assert.equal(actionAllowed("adjudicate_issue", { editor: true, can: (c) => c === "issue.adjudicate" }), true);   // admin/manager
  assert.equal(actionAllowed("adjudicate_issue", { editor: true, can: () => false }), false);                      // sales/tech refused
  // Confirm copy names the decision + keeps-for-audit wording (never "delete").
  assert.match(a.confirm({ name: "Crazy Cars" }, { decision: "resolve", label: "work order — Damaged" }).title, /Resolve the work order — Damaged issue on Crazy Cars/);
  assert.match(a.confirm({ name: "Crazy Cars" }, { decision: "dismiss" }).detail, /dismissed .* never deleted/i);
});

test("2.5 raise_issue: parses a flag command (device ref + reason) and rejects questions / resolve-talk", () => {
  const a = parseRaiseIssue("flag camera 3");
  assert.ok(a && a.ref === "flag camera 3" && a.reason === "Other");
  assert.equal(parseRaiseIssue("report that the front camera is damaged").reason, "Damaged");
  assert.equal(parseRaiseIssue("raise an issue on camera 2 — wrong location").reason, "Wrong location");
  assert.equal(parseRaiseIssue("resolve the camera issue"), null);   // resolve → adjudicate, not raise
  assert.equal(parseRaiseIssue("how is camera 3?"), null);           // a question
  assert.equal(parseRaiseIssue("flag it"), null);                    // no device reference to act on
  assert.equal(parseRaiseIssue("send the proposal"), null);          // unrelated
  // Reason taxonomy mapping (canonical ISSUE_REASONS).
  assert.equal(reasonFromText("the camera is offline and not working"), "Failed test");
  assert.equal(reasonFromText("missing material on the run"), "Missing material");
  assert.equal(reasonFromText("looks fine"), "Other");
});

test("2.5 raise_issue: router carries args; cap=issue.report admits a TECHNICIAN but not sales", () => {
  const r = routeCommand("flag camera 3 as damaged");
  assert.equal(r.type, "action");
  assert.equal(r.name, "raise_issue");
  assert.equal(r.args.reason, "Damaged");
  assert.equal(PROJECT_ACTIONS.raise_issue.cap, "issue.report");
  // issue.report = admin/manager/tech → a tech (NOT an editor) is allowed for THIS action only.
  assert.equal(actionAllowed("raise_issue", { editor: false, can: (c) => c === "issue.report" }), true, "tech may report");
  assert.equal(actionAllowed("raise_issue", { editor: true, can: () => false }), false, "sales (no issue.report) refused");
  // …and reporting grants NO other action: a tech-style can() that only has issue.report can't do the rest.
  const techCan = (c) => c === "issue.report";
  for (const n of ["send_proposal", "record_payment", "advance_stage", "assign_tech", "adjudicate_issue"])
    assert.equal(actionAllowed(n, { editor: false, can: techCan }), false, `${n} refused for a reporter-only role`);
  assert.match(PROJECT_ACTIONS.raise_issue.confirm({ name: "Crazy Cars" }, { deviceLabel: "C3 Camera (Dining)", reason: "Damaged" }).title, /Flag C3 Camera \(Dining\) on Crazy Cars — Damaged/);
});

test("3.2 capture_feedback: router classifies objection/feedback; feedback wins over raise for a device concern", () => {
  const r = routeCommand("log the customer's objection about the price");
  assert.equal(r.type, "action");
  assert.equal(r.name, "capture_feedback");
  assert.equal(r.args.kind, "objection:price");
  // "log the objection about the entrance camera" → feedback (a device concern), NOT an install flag.
  const d = routeCommand("log the objection about the entrance camera");
  assert.equal(d.name, "capture_feedback");
  assert.equal(d.args.wantsDevice, true);
  // …but a genuine install flag still routes to raise_issue (parseFeedback excludes "flag").
  assert.equal(routeCommand("flag the entrance camera as damaged").name, "raise_issue");
});

test("#2 8a propose_change: parses a device-referenced qty change / model swap; defers $-price + questions", () => {
  assert.deepEqual(parseProposeChange("bump the entrance camera to 2 units"), { ref: "bump the entrance camera to 2 units", set: { qty: 2 } });
  assert.deepEqual(parseProposeChange("make camera 3 qty 4"), { ref: "make camera 3 qty 4", set: { qty: 4 } });
  assert.deepEqual(parseProposeChange("change the entrance camera to 4K"), { ref: "change the entrance camera to 4K", set: { name: "4K" } });
  assert.equal(parseProposeChange("switch camera 3 to a dome").set.name, "Dome");
  assert.equal(parseProposeChange("set the entrance camera to $250"), null);   // a $-price → the router's existing edit path
  assert.equal(parseProposeChange("give them 15% off"), null);                 // discount → existing path
  assert.equal(parseProposeChange("what camera is at the entrance?"), null);   // a question
  assert.equal(parseProposeChange("change the schedule"), null);               // no device reference
  assert.equal(parseProposeChange("change the entrance camera to blue"), null);// no spec token → not a model swap
  // Router carries it as an action.
  const r = routeCommand("bump the entrance camera to 2 units");
  assert.equal(r.type, "action"); assert.equal(r.name, "propose_change"); assert.deepEqual(r.args.set, { qty: 2 });
});

test("#2 8a propose_change: DRAFT-only availability; cap-less editor gate (tech refused)", () => {
  const a = PROJECT_ACTIONS.propose_change;
  assert.equal(a.available({ proposal_status: "draft" }).ok, true);
  assert.equal(a.available({ proposal_status: "sent" }).ok, false);
  assert.match(a.available({ proposal_status: "sent" }).why, /already been sent|revising/i);
  assert.equal(a.available({ proposal_status: null }).ok, false);
  assert.equal(a.cap, null);
  assert.equal(actionAllowed("propose_change", { editor: true, can: () => false }), true);    // admin/manager/sales
  assert.equal(actionAllowed("propose_change", { editor: false, can: () => true }), false);   // tech refused (non-editor)
  assert.match(a.confirm({ name: "Crazy Cars" }, { lineLabel: "Camera 2", change: "qty 1 → 2" }).title, /Update Camera 2 on Crazy Cars'?s proposal/);
  assert.match(a.confirm({ name: "Crazy Cars" }, { change: "qty 1 → 2" }).detail, /draft only; nothing is sent/i);
});

test("#2 8b remove_line: parses a remove command; cap=proposal.revise (admin/manager, sales refused)", () => {
  assert.deepEqual(parseRemoveLine("drop the entrance camera"), { ref: "drop the entrance camera" });
  assert.deepEqual(parseRemoveLine("remove camera 3 from the proposal"), { ref: "remove camera 3 from the proposal" });
  assert.equal(parseRemoveLine("drop me a line sometime"), null);     // no device/line reference
  assert.equal(parseRemoveLine("how do I remove a camera?"), null);   // a question
  assert.equal(parseRemoveLine("add a camera"), null);                // not a remove verb
  const r = routeCommand("drop the entrance camera");
  assert.equal(r.type, "action"); assert.equal(r.name, "remove_line");
  const a = PROJECT_ACTIONS.remove_line;
  assert.equal(a.cap, "proposal.revise");
  assert.equal(a.available({ proposal_status: "draft" }).ok, true);
  assert.equal(a.available({ proposal_status: "sent" }).ok, false);
  assert.equal(actionAllowed("remove_line", { editor: true, can: (c) => c === "proposal.revise" }), true);  // admin/manager
  assert.equal(actionAllowed("remove_line", { editor: true, can: () => false }), false);                     // sales refused
  assert.match(a.confirm({ name: "Crazy Cars" }, { lineLabel: "Camera 1 (Entrance)" }).title, /Remove Camera 1 \(Entrance\) from Crazy Cars'?s proposal/);
});

test("#2 8b remove_item applies to the payload (pure): the matched line is gone, original untouched", () => {
  const payload = { options: [{ id: "A", services: [{ key: "camera", label: "Cameras", items: [
    { id: "x1", name: "Camera 1 (Entrance)", qty: 1, price: 0, camera_id: "cBBB222", sub: [{ id: "s1", name: "Drop", qty: 1, price: 150 }] },
    { id: "x2", name: "NVR", qty: 1, price: 400 },
  ] }] }] };
  const out = applyIntentToPayload(payload, { type: "remove_item", match: { id: "x1" } });
  assert.ok(!out.error);
  assert.deepEqual(out.removed, ["Camera 1 (Entrance)"]);
  const items = out.payload.options[0].services[0].items;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "x2");
  assert.equal(payload.options[0].services[0].items.length, 2);   // structuredClone → original intact
  // An unmatched id is a handled error, not a crash.
  assert.match(applyIntentToPayload(payload, { type: "remove_item", match: { id: "nope" } }).error, /No line item/);
});

test("3.2 capture_feedback: cap-less → editor gate (admin/manager/sales), a technician is refused", () => {
  assert.equal(PROJECT_ACTIONS.capture_feedback.cap, null);   // no extra cap → editor gate
  assert.equal(actionAllowed("capture_feedback", { editor: true, can: () => false }), true);   // sales/admin/manager
  assert.equal(actionAllowed("capture_feedback", { editor: false, can: () => true }), false);  // tech (non-editor) refused
  assert.match(PROJECT_ACTIONS.capture_feedback.confirm({ name: "Crazy Cars" }, { kind: "objection:need", deviceLabel: "C2 Camera (Front Entrance)", body: "not sure we need it" }).title, /Log Need objection on C2 Camera \(Front Entrance\) for Crazy Cars/);
});
