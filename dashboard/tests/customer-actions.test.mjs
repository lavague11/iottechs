// Canonical customer required-action resolver (pure core) + its wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requiredActionsFromState } from "../lib/proposal.js";

const types = (a) => a.map((x) => x.documentType);

test("proposal: an actionable, unsigned version needs a signature; a signed-current one needs nothing", () => {
  assert.deepEqual(types(requiredActionsFromState({ proposal: { ref: 1, version: 2, actionable: true, signedCurrent: false } })), ["proposal"]);
  assert.deepEqual(requiredActionsFromState({ proposal: { ref: 1, actionable: true, signedCurrent: true } }), []);
  assert.deepEqual(requiredActionsFromState({ proposal: { ref: 1, actionable: false, signedCurrent: false } }), []);   // draft/declined → not actionable
  const a = requiredActionsFromState({ proposal: { ref: 7, version: 3, actionable: true, signedCurrent: false } })[0];
  assert.equal(a.action, "signature"); assert.equal(a.status, "required"); assert.equal(a.version, 3); assert.equal(a.ref, 7);
});

test("PCP: an applicable, un-agreed credit needs approval; agreed or N/A needs nothing", () => {
  assert.deepEqual(types(requiredActionsFromState({ pcp: { applies: true, agreed: false } })), ["pcp"]);
  assert.deepEqual(requiredActionsFromState({ pcp: { applies: true, agreed: true } }), []);
  assert.deepEqual(requiredActionsFromState({ pcp: { applies: false, agreed: false } }), []);
  assert.equal(requiredActionsFromState({ pcp: { applies: true, agreed: false } })[0].action, "approval");
});

test("change orders: shared + priced + unsigned need a signature; drafts / priced-pending / unshared don't", () => {
  const base = { id: "a1", title: "Add 2 cameras", shared: true, needsPricing: false, signedCurrent: false };
  assert.deepEqual(types(requiredActionsFromState({ addendums: [base] })), ["change_order"]);
  assert.deepEqual(requiredActionsFromState({ addendums: [{ ...base, shared: false }] }), []);       // not shared with the customer
  assert.deepEqual(requiredActionsFromState({ addendums: [{ ...base, needsPricing: true }] }), []);  // still being priced
  assert.deepEqual(requiredActionsFromState({ addendums: [{ ...base, signedCurrent: true }] }), []); // already signed
});

test("multiple outstanding actions come back in priority order: proposal → change orders → PCP", () => {
  const out = requiredActionsFromState({
    proposal: { ref: 1, actionable: true, signedCurrent: false },
    addendums: [{ id: "a1", title: "CO", shared: true, needsPricing: false, signedCurrent: false }],
    pcp: { applies: true, agreed: false },
  });
  assert.deepEqual(types(out), ["proposal", "change_order", "pcp"]);
});

test("the DB wrapper, server action, and portal action center are wired", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.ok(/export function resolveCustomerRequiredActions\(accessId\)/.test(db), "db wrapper exists");
  assert.ok(db.includes("requiredActionsFromState({ proposal, pcp, addendums })"), "wrapper calls the pure core");
  assert.ok(db.includes("addendumSignatureCurrent(a)"), "change-order signature state read from the canonical helper");
  const act = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  assert.ok(/export async function customerActionsAction\(accessId\)/.test(act) && act.includes("canReadProject(accessId)"), "read-gated server action");
  const pcv = readFileSync(new URL("../app/project/[accessId]/proposal-customer-view.jsx", import.meta.url), "utf8");
  assert.ok(pcv.includes("customerActionsAction(accessId)"), "customer view fetches the resolved actions");
  assert.ok(pcv.includes("showActionCenter") && pcv.includes("pcv-actctr") && pcv.includes("documents need your attention"), "multi-document action center renders");
  assert.ok(/pageActions\.length > 1/.test(pcv), "action center shows only when MORE THAN ONE action is outstanding");
});

test("DOCUMENT_ACTION_REQUIRED: sending a proposal drops an in-app customer notification (parity with change orders)", () => {
  const act = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  const send = act.slice(act.indexOf("export async function sendProposalAction"), act.indexOf("export async function", act.indexOf("export async function sendProposalAction") + 10));
  assert.ok(send.includes("getCustomerUserForProject(accessId)") && send.includes("createNotification("), "send creates a customer notification");
  assert.ok(send.includes("Your proposal is ready to review") && send.includes("?open=proposal"), "it reads as a review request and deep-links to the proposal");
  assert.ok(send.includes("&sign="), "the deep-link auto-opens the signer on the primary option");
  // Fix #4 — ONE "Send for signature": the send now ALSO emails the direct signing link in the same
  // step (deep-links into the signer), instead of marking sent and prompting for a separate email.
  assert.ok(send.includes("emailSignatureRequest(accessId, primaryOpt)"), "send auto-emails the signing link (one Send for signature)");
  assert.ok(send.includes("emailed"), "send returns whether the email went so the UI can confirm");
});

// ---- B8: never announce a document that was never sent -------------------------------------------
// customerTodo was keyed on the stage column alone. The stage column is a cache, and stageFloorFacts
// additionally invents proposal_status:"accepted" past approval_deposit — so any project parked past
// `proposal` with no published proposal told its customer "a new proposal is ready — review & accept".
// 14 projects in the local database were doing exactly that; it is now 0.
import { customerTodo } from "../lib/customer-action.js";

test("B8: no published proposal → no proposal prompt, at any stage past it", () => {
  for (const stage of ["proposal", "approval_deposit", "payment"]) {
    const t = customerTodo({ stage, proposal_published: false, proposal_status: "accepted", proposal_signed: false, deposit_recorded: false, final_balance_paid: false });
    assert.equal(t, null, `${stage} must not announce a proposal that does not exist`);
  }
});

test("B8: a real published proposal still produces every prompt it used to", () => {
  const base = { proposal_published: true };
  assert.equal(customerTodo({ ...base, stage: "proposal", proposal_status: "sent" }).order, 2);
  assert.match(customerTodo({ ...base, stage: "proposal", proposal_status: "sent", proposal_version: 2 }).label, /revised/);
  assert.equal(customerTodo({ ...base, stage: "approval_deposit", proposal_status: "accepted", proposal_signed: false }).order, 3);
  assert.equal(customerTodo({ ...base, stage: "approval_deposit", proposal_status: "accepted", proposal_signed: true, deposit_recorded: false }).order, 4);
  assert.equal(customerTodo({ ...base, stage: "payment", proposal_status: "accepted", final_balance_paid: false }).order, 5);
  assert.equal(customerTodo({ ...base, stage: "payment", proposal_status: "accepted", final_balance_paid: true }), null);
});

test("B8: the flag is opt-in — a caller that omits it keeps the old behaviour", () => {
  assert.equal(customerTodo({ stage: "proposal", proposal_status: "sent" }).order, 2, "absent → not suppressed");
});

// The same defect one branch up: a survey that exists but was never submitted is not the customer's
// to approve. ASC00SR in the local database was asking for approval of an unsubmitted survey.
test("B8: an unsubmitted survey is not offered for approval", () => {
  assert.equal(customerTodo({ stage: "site_survey", survey_accepted: false, survey_submitted: false }), null);
  assert.equal(customerTodo({ stage: "site_survey", survey_accepted: false, survey_submitted: true }).order, 1);
  assert.equal(customerTodo({ stage: "site_survey", survey_accepted: false }).order, 1, "absent → old behaviour");
});

test("B8: the card passes the UNFLOORED published fact, not the floored one", () => {
  const card = readFileSync(new URL("../lib/my-projects-card.js", import.meta.url), "utf8");
  assert.match(card, /proposal_published: !!facts\.proposal_status/, "read from the raw facts, not sf");
  assert.doesNotMatch(card, /proposal_published: !!sf\.proposal_status/, "sf is floored and would defeat the guard");
});

// ---- B6: ONE add-on total ------------------------------------------------------------------------
// CLAUDE.md forbids duplicating a financial calculation. Five copies of
// `max(0, Σ qty×price − discount)` existed; four were label, email and PDF text that differed from the
// shared helper only in sub-cent rounding. They now all call proposal.addendumTotals.
import { addendumTotals } from "../lib/proposal.js";

test("B6: every add-on total comes from addendumTotals, with no hand-rolled copies left", () => {
  const files = {
    "lib/addendum-pdf.js": "the change-order PDF",
    "lib/email.js": "the approval email",
    "app/api/addendum/route.js": "the signed-add-on event label",
    "app/project/[accessId]/proposal-actions.js": "the same label server-side",
  };
  for (const [rel, what] of Object.entries(files)) {
    const src = readFileSync(new URL("../" + rel, import.meta.url), "utf8");
    assert.match(src, /addendumTotals\(/, `${what} uses the shared helper`);
    assert.doesNotMatch(src, /Math\.max\(0,[^\n]*reduce\(\(s, it\) => s \+ \(\+it\?*\.qty \|\| 0\) \* \(\+it\?*\.price \|\| 0\)/,
      `${what} still has its own copy of the add-on total`);
  }
});

test("B6: the helper rounds the way the copies did, so no figure moves", () => {
  const a = { items: [{ qty: 2, price: 175 }, { qty: 1, price: 150 }], discount: 50 };
  // the figures, not the object's exact shape (an untaxed add-on reports tax 0 since B1)
  const t = addendumTotals(a);
  assert.equal(t.sub, 500); assert.equal(t.discount, 50); assert.equal(t.total, 450); assert.equal(t.tax, 0);
  // a discount larger than the subtotal floors at zero, never negative
  assert.equal(addendumTotals({ items: [{ qty: 1, price: 10 }], discount: 99 }).total, 0);
  // missing qty counts as 0 in the TOTAL — the long-standing rule the copies shared
  assert.equal(addendumTotals({ items: [{ price: 100 }] }).total, 0);
  for (const empty of [{}, null]) {
    const z = addendumTotals(empty);
    assert.equal(z.sub, 0); assert.equal(z.discount, 0); assert.equal(z.total, 0); assert.equal(z.tax, 0);
  }
});
