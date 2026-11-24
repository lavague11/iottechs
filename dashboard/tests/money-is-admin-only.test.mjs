// WHO MAY TOUCH MONEY.
//
// STEP 8 of the lifecycle audit. The worry was that a technician could record a payment. The server
// never allowed it — but three things were true and worth fixing anyway:
//   · recording/confirming/removing a payment was open to a MANAGER as well as an admin;
//   · the UI offered a Record button to roles the server would refuse;
//   · a role that cannot see the money saw no status at all, so a technician could not tell that a
//     job was waiting on payment rather than on them.
//
// Every assertion below reads the REAL gate out of the real source. The point of this file is that
// the server is the thing being tested: a UI that hides a button proves nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { can } from "../lib/roles.js";

const actions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/project/[accessId]/page.jsx", import.meta.url), "utf8");
const gateway = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
const pay = readFileSync(new URL("../app/api/pay/create/route.js", import.meta.url), "utf8");
const other = readFileSync(new URL("../app/project/[accessId]/actions.js", import.meta.url), "utf8");

// ------------------------------------------------------------------ the ledger is admin only

test("the three ledger actions are ADMIN only, server-side", () => {
  assert.match(actions, /const PAY_ADMIN = new Set\(\["admin"\]\);/, "one narrow set, not STAFF");
  assert.match(actions, /if \(!isCustomer && !PAY_ADMIN\.has\(tok\.role\)\) return \{ error: "Only an admin can record a payment\." \};/);
  assert.match(actions, /\} else if \(!PAY_ADMIN\.has\(tok\.role\)\) \{\s*\n\s*return \{ error: "Only an admin can remove a payment\." \};/);
  assert.match(actions, /if \(!tok \|\| !PAY_ADMIN\.has\(tok\.role\)\) return \{ error: "Only an admin can confirm a payment\." \};/);
  // and no money action still leans on the wider set
  assert.ok(!/recordPaymentAction[\s\S]{0,400}STAFF\.has/.test(actions), "record no longer uses STAFF");
});

test("a technician is refused by every money gate — not merely un-buttoned", () => {
  // The gates are role SETS in source; assert the tech is in none of the money ones.
  const sets = {
    PAY_ADMIN: /const PAY_ADMIN = new Set\(\[([^\]]*)\]\)/,
    INV_STAFF: /const INV_STAFF = new Set\(\[([^\]]*)\]\)/,
    STAFF: /const STAFF = new Set\(\[([^\]]*)\]\)/,
    STAFF_EDIT: /const STAFF_EDIT = new Set\(\[([^\]]*)\]\)/,   // proposal pricing
  };
  for (const [name, re] of Object.entries(sets)) {
    const m = actions.match(re);
    assert.ok(m, `${name} exists`);
    assert.ok(!/tech/.test(m[1]), `${name} must not contain tech — it is a money gate`);
  }
  // commission, in the other action file
  assert.match(other, /setCommissionAction[\s\S]{0,200}\["admin","manager"\]\.includes\(tok\?\.role\)/);
  // the capability a tech is excluded from, which gates the FIGURES themselves
  assert.equal(can("tech", "customer.financials.view"), false);
  assert.equal(can("tech", "cost.view"), false);
});

test("the figures are never sent to a tech in the first place", () => {
  // The strongest guarantee: not "hidden in the client" but never computed for that role.
  assert.match(page, /const maySeeMoney = can\(initialView, "customer\.financials\.view"\);/);
  assert.match(page, /if \(\(customerPortalV2 \|\| staffHub\) && maySeeMoney\) \{/);
  // the gate wraps the COMPUTATION, so there is nothing in the payload to re-reveal
  const gateAt = page.indexOf("if ((customerPortalV2 || staffHub) && maySeeMoney)");
  const finAt = page.indexOf("getProjectFinancialState(p.access_id)");
  assert.ok(gateAt > 0 && finAt > gateAt, "the finance call sits INSIDE the capability gate");
});

// ------------------------------------------------------------------ what the tech does see

test("a role without the money capability sees the STATUS but never a button", () => {
  // Read-only: the technician can tell the job is waiting on payment, so they do not chase it.
  assert.match(gateway, /status=\{as \? \{ state: projState/, "the status is not suppressed");
  assert.match(gateway, /const canRecordPay = cView === "admin";/);
  assert.match(gateway, /AWAITING_DEPOSIT:\s*canRecordPay \?/, "deposit button is admin only");
  assert.match(gateway, /AWAITING_FINAL_PAYMENT: canRecordPay \?/, "final payment button is admin only");
  assert.match(gateway, /\(canRecordPay && staffFinance\?\.hasContract/, "and so is the action-rail button");
});

test("the UI follows the server, so no role is offered a refusal", () => {
  // A manager can SEE the balance but may not record: the button must not appear for them either.
  assert.ok(!/AWAITING_FINAL_PAYMENT:\s*canSeeMoney \?/.test(gateway), "the button is not gated on mere visibility");
  assert.equal(can("manager", "customer.financials.view"), true, "a manager still sees the figures…");
  // …and PAY_ADMIN excludes them, which is the point of the two separate gates.
  assert.ok(!/const PAY_ADMIN = new Set\(\["admin", "manager"\]\)/.test(actions));
});

// ------------------------------------------------------------------ the customer

test("a customer may PAY but may not record cash or edit amounts", () => {
  // Online pay: the customer may, a tech may not, and the endpoint answers 403 rather than silently.
  assert.match(pay, /if \(sess && \["admin", "manager"\]\.includes\(sess\.role\)\) return true;/);
  assert.match(pay, /sess\?\.role === "customer" && customerOwnsProjectAccount/);
  assert.ok(!/"tech"/.test(pay), "a technician is not on the pay path at all");
  assert.match(pay, /status: 403/, "and refusal is a real 403");
  // Recording cash is staff-side: a customer SUBMITS, which stays pending until an admin confirms.
  assert.match(actions, /source: isCustomer \? "customer" : "staff"/);
  assert.match(actions, /You can only cancel a pending payment you submitted\./);
  // Pricing is not a customer action.
  const m = actions.match(/const STAFF_EDIT = new Set\(\[([^\]]*)\]\)/);
  assert.ok(!/customer/.test(m[1]), "a customer cannot edit proposal pricing");
});
