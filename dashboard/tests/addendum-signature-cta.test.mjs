// B13 — "addendum awaiting signature → Sign" (spec O·166), the half that was never built.
//
// The entry blamed missing data ("0 projects are in that state today"). The real cause was worse: the
// required-actions engine gated the change_order branch on `a.shared`, and NOTHING has ever written a
// `shared` field — not the builder, not /api/addendum, not reconcileAddendumWrite. The branch could not
// fire for any record at any point in its life, so the banner was as silent as the card.
//
// Fixed by making "in front of the customer" DERIVED state with one definition
// (addendumAwaitingCustomer), reused by the money line, the banner, the card CTA and the portal, so
// they cannot disagree about whether an add-on is an outstanding ask.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addendumAwaitingCustomer, requiredActionsFromState } from "../lib/proposal.js";
import { customerTodo } from "../lib/customer-action.js";
import { projectCardAction } from "../lib/my-projects-card.js";
import { PORTAL_VIEWS, OVERLAY_VIEWS, viewFromParams, viewAvailability, overlayAvailable, portalCards } from "../lib/customer-portal.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("one definition of 'waiting on the customer', and it is derived, not stored", () => {
  assert.equal(addendumAwaitingCustomer({ status: "pending" }), true, "priced + pending is an ask");
  assert.equal(addendumAwaitingCustomer({ status: "pending", needsPricing: true }), false, "unpriced is the office's move");
  assert.equal(addendumAwaitingCustomer({ status: "approved" }), false, "already signed");
  assert.equal(addendumAwaitingCustomer({ status: "voided" }), false);
  assert.equal(addendumAwaitingCustomer({ status: "declined" }), false);
  assert.equal(addendumAwaitingCustomer({ status: "pending", voidedAt: "2026-11-17" }), false);
  assert.equal(addendumAwaitingCustomer(null), false);
  // an edited signed add-on drops back to pending + resignRequired, so re-signing is the same rule
  assert.equal(addendumAwaitingCustomer({ status: "pending", resignRequired: true }), true);
  // and the money line reads the same predicate rather than repeating the filter
  assert.ok(read("../lib/db.js").includes(".filter(addendumAwaitingCustomer)"), "getPendingAddons shares it");
});

test("the required-action fires now — before, `shared` was a field nobody wrote", () => {
  const addendums = [{ id: "a1", title: "3 back-lot cameras", shared: true, needsPricing: false, signedCurrent: false }];
  const out = requiredActionsFromState({ proposal: null, pcp: null, addendums });
  assert.equal(out.length, 1);
  assert.equal(out[0].documentType, "change_order");
  assert.equal(out[0].action, "signature");
  // db.js derives `shared` instead of reading it, which is what makes the branch reachable
  assert.ok(read("../lib/db.js").includes("shared: a?.shared === true || addendumAwaitingCustomer(a)"),
    "resolveCustomerRequiredActions derives it");
});

test("customerTodo gains the branch, ranked last so it displaces nothing", () => {
  // the gap B13 describes: an unsigned change order during install used to fall through to "Open"
  const todo = customerTodo({ stage: "install", addendum_awaiting_signature: true, proposal_published: true });
  assert.ok(todo, "an unsigned change order is an obligation at install, where no other branch matches");
  assert.equal(todo.cta, "Sign");
  assert.equal(todo.order, 6);
  // it never outranks an earlier obligation
  const deposit = customerTodo({ stage: "approval_deposit", proposal_status: "accepted", proposal_signed: true,
    deposit_recorded: false, addendum_awaiting_signature: true, proposal_published: true });
  assert.equal(deposit.order, 4, "pay the deposit first");
  // and nothing appears when there is no change order
  assert.equal(customerTodo({ stage: "install", proposal_published: true }), null);
});

test("the card's Sign button only appears when the add-on really exists, and points at it", () => {
  const card = { access_id: "ASC0128", todo: { order: 6 }, actionable: { addendum: true } };
  assert.deepEqual(projectCardAction(card), { label: "Sign", href: "/project/ASC0128?open=addendum" });
  // the no-promise rule: without the fact established, no button (a dead deep link is worse than none)
  assert.equal(projectCardAction({ access_id: "ASC0128", todo: { order: 6 }, actionable: {} }).label, "Open");
  // a finished project never shows a stale obligation
  assert.equal(projectCardAction({ access_id: "ASC0128", status: { key: "done" }, todo: { order: 6 }, actionable: { addendum: true } }).label, "View");
});

test("that link actually opens something — the portal has the view, so the CTA is not dead", () => {
  // this is the trap projectCardAction warns about: the portal drops an unknown ?view and silently
  // lands the customer on the portal home. Portal V2 had no addendum view at all.
  assert.ok(PORTAL_VIEWS.includes("addendum"));
  assert.ok(OVERLAY_VIEWS.includes("addendum"));
  assert.equal(viewFromParams({ open: "addendum" }), "addendum", "the card's ?open= name maps to the V2 view");
  const ctx = { addendumAwaiting: true, addendumCount: 1 };
  assert.equal(viewAvailability(ctx, null).addendum, true);
  assert.equal(overlayAvailable("addendum", ctx, null), true);
  // nothing to show → no overlay and no card, rather than an empty shell
  assert.equal(overlayAvailable("addendum", { addendumCount: 0 }, null), false);
  assert.ok(!portalCards({ addendumCount: 0 }, null).some((c) => c.key === "addendum"));
  // and the gateway mounts the real component for it
  assert.ok(read("../app/project/[accessId]/gateway-client.jsx").includes('case "addendum":'), "the portal overlay exists");
});

test("the portal card says which way the ball is pointing", () => {
  const awaiting = portalCards({ addendumAwaiting: true, addendumCount: 1 }, null).find((c) => c.key === "addendum");
  assert.equal(awaiting.state, "awaiting");
  const signed = portalCards({ addendumAwaiting: false, addendumCount: 1 }, null).find((c) => c.key === "addendum");
  assert.equal(signed.state, "signed", "a signed add-on stays readable, it just stops asking");
  const ui = read("../app/project/[accessId]/customer-portal.jsx");
  assert.ok(ui.includes('c.state === "awaiting" ? "Sign" : "View"'), "Sign only while it is their move");
});
