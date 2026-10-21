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
  assert.ok(send.includes("emailProposalReady(accessId)"), "and the email still fires alongside it");
});
