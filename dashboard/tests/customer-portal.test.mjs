// Customer Portal V2 — pure logic. Eligibility, flag precedence, appointment pick, balance shaping, and the
// applicable-card list. No DB: this is where the presentation contract is pinned (reuses canonical engines
// elsewhere). Covers the owner's checklist items that are decidable without a browser.
import test from "node:test";
import assert from "node:assert/strict";
import {
  eligibleForCustomerPortalV2, customerPortalV2For, pickUpcomingAppt, financeSummary,
  installStatusOf, proposalCardState, portalCards, viewFromParams, PORTAL_VIEWS, payable,
  viewAvailability, overlayAvailable, OVERLAY_VIEWS,
} from "../lib/customer-portal.js";

test("eligibility: install types A/B only, service-call C excluded", () => {
  assert.equal(eligibleForCustomerPortalV2({ project_type: "A" }), true);
  assert.equal(eligibleForCustomerPortalV2({ project_type: "B" }), true);
  assert.equal(eligibleForCustomerPortalV2({ project_type: "C" }), false);
  assert.equal(eligibleForCustomerPortalV2({}), true);            // missing → default A (eligible)
});

test("flag precedence: ineligible → always V1; override wins; else global", () => {
  // ineligible is always V1 even with global on + v2 override
  assert.equal(customerPortalV2For({ project_type: "C", portal_version: "v2" }, { globalOn: true }), false);
  // per-project override beats global
  assert.equal(customerPortalV2For({ project_type: "A", portal_version: "v2" }, { globalOn: false }), true);
  assert.equal(customerPortalV2For({ project_type: "A", portal_version: "v1" }, { globalOn: true }), false);
  // inherit global
  assert.equal(customerPortalV2For({ project_type: "A" }, { globalOn: true }), true);
  assert.equal(customerPortalV2For({ project_type: "A" }, { globalOn: false }), false);
});

test("upcoming appointment: nearest future chosen; past ignored", () => {
  const now = new Date("2026-11-05T12:00:00").getTime();
  const events = [
    { id: 1, date: "2026-11-01", time: "09:00", title: "old" },     // past
    { id: 2, date: "2026-11-10", time: "09:00", title: "install" }, // future
    { id: 3, date: "2026-11-07", time: "14:00", title: "survey" },  // nearer future
  ];
  assert.equal(pickUpcomingAppt(events, now)?.id, 3);
  assert.equal(pickUpcomingAppt([], now), null);
  assert.equal(pickUpcomingAppt(null, now), null);
  // within the 1h grace window still counts
  assert.equal(pickUpcomingAppt([{ id: 9, date: "2026-11-05", time: "11:30" }], now)?.id, 9);
});

test("balance summary: canonical fields, paid-in-full, no-contract hides card", () => {
  const none = financeSummary(null);
  assert.equal(none.hasContract, false);
  assert.equal(none.balance, 0);

  const owing = financeSummary({ total: 8500, paid: 3500, balance: 5000, amountDueNow: 5000, financialState: "due_now" }, 1700);
  assert.deepEqual(
    { c: owing.hasContract, t: owing.total, p: owing.paid, b: owing.balance, pif: owing.paidInFull, d: owing.depositDue },
    { c: true, t: 8500, p: 3500, b: 5000, pif: false, d: 1700 }
  );

  const done = financeSummary({ total: 8500, paid: 8500, balance: 0, financialState: "collected" });
  assert.equal(done.paidInFull, true);
  // balance derived when not provided
  assert.equal(financeSummary({ total: 1000, paid: 250, financialState: "due_now" }).balance, 750);
});

test("payment eligibility: pay CTA only when money is collectible now (amountDueNow>0)", () => {
  // approved/unsigned proposal: contract exists, balance > 0, but NOTHING is due yet → no pay CTA
  assert.equal(payable(financeSummary({ total: 2220, paid: 0, balance: 2220, amountDueNow: 0, financialState: "awaiting_signature" })), false);
  assert.equal(payable(financeSummary({ total: 2220, paid: 0, balance: 2220, amountDueNow: 0, financialState: "none" })), false);
  // deposit due after signing → pay CTA
  assert.equal(payable(financeSummary({ total: 2220, paid: 0, balance: 2220, amountDueNow: 1110, financialState: "awaiting_deposit" }, 1110)), true);
  // final balance due → pay CTA
  assert.equal(payable(financeSummary({ total: 2220, paid: 1110, balance: 1110, amountDueNow: 1110, financialState: "due_now" })), true);
  // paid in full / no contract → no pay CTA
  assert.equal(payable(financeSummary({ total: 2220, paid: 2220, balance: 0, financialState: "collected" })), false);
  assert.equal(payable(financeSummary(null)), false);
});

test("installation status mapping", () => {
  assert.equal(installStatusOf({}, "site_survey"), "awaiting");
  assert.equal(installStatusOf({ install_date: "2026-11-10" }, "schedule"), "scheduled");
  assert.equal(installStatusOf({}, "install"), "in_progress");
  assert.equal(installStatusOf({ install_done: true }, "install"), "complete");
  assert.equal(installStatusOf({}, "qc"), "complete");
});

test("proposal card state: ready/awaiting vs signed vs none", () => {
  assert.equal(proposalCardState({ proposalPublished: false }), null);
  assert.equal(proposalCardState({ proposalPublished: true, proposalStatus: "sent" }), "awaiting");
  assert.equal(proposalCardState({ proposalPublished: true, proposalStatus: "accepted", proposalSigned: true }), "signed");
  assert.equal(proposalCardState({ proposalPublished: true, proposalStatus: "draft" }), null);
});

test("portalCards: only applicable cards, in order, never empty placeholders", () => {
  // early project: survey only, no mockup, no proposal
  const early = portalCards({ surveyHasData: true, mockupHasData: false, proposalPublished: false, stage: "site_survey", facts: {} });
  assert.deepEqual(early.map((c) => c.key), ["survey"]);

  // proposal awaiting signature, with survey + mockup
  const prop = portalCards({ surveyHasData: true, mockupHasData: true, proposalPublished: true, proposalStatus: "sent", stage: "proposal", facts: {} });
  assert.deepEqual(prop.map((c) => c.key), ["survey", "mockup", "proposal"]);
  assert.equal(prop.find((c) => c.key === "proposal").state, "awaiting");

  // signed + pre-install → phone setup appears
  const signed = portalCards({ surveyHasData: true, mockupHasData: true, proposalPublished: true, proposalStatus: "accepted", proposalSigned: true, stage: "schedule", facts: { install_date: "2026-11-10" } });
  assert.ok(signed.map((c) => c.key).includes("phone"));
  assert.ok(signed.map((c) => c.key).includes("install"));

  // completed + paid → completion card; no phone card once install complete
  const complete = portalCards({ proposalPublished: true, proposalStatus: "accepted", proposalSigned: true, stage: "completion", facts: { install_done: true }, closeoutReady: true, complete: true, paidInFull: true, installComplete: true });
  assert.ok(complete.map((c) => c.key).includes("completion"));
  assert.ok(!complete.map((c) => c.key).includes("phone"));

  // completed but NOT paid → no completion card
  const unpaid = portalCards({ proposalPublished: true, proposalSigned: true, stage: "completion", facts: { install_done: true }, complete: true, paidInFull: false });
  assert.ok(!unpaid.map((c) => c.key).includes("completion"));

  // no data at all → empty list (no placeholders)
  assert.deepEqual(portalCards({ facts: {}, stage: "inquiry" }), []);
});

test("closeout readiness: card appears only with real customer-closeout content (not merely qc stage)", () => {
  // qc stage but NO customer-facing closeout content → no closeout card (the empty-state fix)
  const empty = portalCards({ stage: "qc", facts: { install_done: true }, proposalPublished: true, proposalSigned: true });
  assert.ok(!empty.map((c) => c.key).includes("closeout"));
  // QC all-pass ready → closeout card appears
  const ready = portalCards({ stage: "qc", facts: { install_done: true }, proposalPublished: true, proposalSigned: true, closeoutReady: true });
  assert.ok(ready.map((c) => c.key).includes("closeout"));
  // a customer signoff already on file also counts as ready (don't hide a legitimate required signoff)
  assert.equal(viewAvailability({ stage: "qc", closeoutReady: true }).closeout, true);
  assert.equal(viewAvailability({ stage: "qc", closeoutReady: false }).closeout, false);
});

test("viewAvailability: one canonical resolver gates every view", () => {
  const F = (o) => financeSummary(o);
  // payment only when collectible now
  assert.equal(viewAvailability({}, F({ total: 2220, amountDueNow: 0, financialState: "awaiting_signature" })).payment, false);
  assert.equal(viewAvailability({}, F({ total: 2220, amountDueNow: 1110, financialState: "awaiting_deposit" })).payment, true);
  // survey/mockup only with data
  assert.equal(viewAvailability({ surveyHasData: true }).survey, true);
  assert.equal(viewAvailability({ surveyHasData: false }).survey, false);
  assert.equal(viewAvailability({ mockupHasData: true }).mockup, true);
  // proposal only when published
  assert.equal(viewAvailability({ proposalPublished: true, proposalStatus: "sent" }).proposal, true);
  assert.equal(viewAvailability({ proposalPublished: false }).proposal, false);
  // install with an upcoming appointment or a scheduled+ status
  assert.equal(viewAvailability({ hasAppt: true, facts: {} }).install, true);
  assert.equal(viewAvailability({ facts: {}, stage: "inquiry" }).install, false);
  // completion only when complete AND paid in full
  assert.equal(viewAvailability({ complete: true, paidInFull: true }).completion, true);
  assert.equal(viewAvailability({ complete: true, paidInFull: false }).completion, false);
});

test("overlayAvailable: direct ?view selects a view but never overrides availability", () => {
  const owing = financeSummary({ total: 2220, amountDueNow: 1110, financialState: "awaiting_deposit" });
  const none = financeSummary(null);
  // payment route unavailable when nothing is due; available when due
  assert.equal(overlayAvailable("payment", {}, none), false);
  assert.equal(overlayAvailable("payment", {}, owing), true);
  // survey/completion routes gated by content/eligibility
  assert.equal(overlayAvailable("survey", { surveyHasData: false }), false);
  assert.equal(overlayAvailable("completion", { complete: true, paidInFull: false }), false);
  assert.equal(overlayAvailable("completion", { complete: true, paidInFull: true }), true);
  // phone is a link-out, never an overlay; unknown views are not overlays
  assert.equal(overlayAvailable("phone", { proposalPublished: true, proposalSigned: true }), false);
  assert.equal(overlayAvailable("bogus", {}), false);
  assert.ok(!OVERLAY_VIEWS.includes("phone"));
});

test("appointment picker ignores past/cancelled dates and never invents one from install_date", () => {
  const now = new Date("2026-11-05T12:00:00").getTime();
  // only a past event → none upcoming
  assert.equal(pickUpcomingAppt([{ id: 1, date: "2026-11-01", time: "09:00", kind: "install" }], now), null);
  // facts.install_date is NOT a schedule event → the picker (events only) returns null
  assert.equal(pickUpcomingAppt([], now), null);
});

test("viewFromParams: validates ?view and maps legacy ?open", () => {
  assert.equal(viewFromParams({ view: "proposal" }), "proposal");
  assert.equal(viewFromParams({ view: "bogus" }), null);
  assert.equal(viewFromParams({ open: "proposal" }), "proposal");
  assert.equal(viewFromParams({ open: "site_survey" }), "survey");
  assert.equal(viewFromParams({ open: "deposit" }), "payment");
  assert.equal(viewFromParams({}), null);
  assert.ok(PORTAL_VIEWS.includes("completion"));
});
