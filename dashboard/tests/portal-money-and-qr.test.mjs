// WHAT THE PORTAL HERO SAYS, AND TO WHOM.
//
// Three things the owner found on a live job (ASC0065):
//   1. The demo bar covered the customer's name. Both the bar and the portal header stick to top:0,
//      and the bar wins on z-index, so the header slid underneath it.
//   2. "Awaiting Final Payment / Record Final Payment" rendered for roles that may not see the
//      customer's financials. A technician's work does not change because an invoice is unpaid, and
//      the button is one they cannot press.
//   3. The customer's own activation QR was reachable only by digging into Completion.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { can } from "../lib/roles.js";
import { STATE_ACTION, CUSTOMER_STATUS } from "../lib/project-status.js";

const gateway = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/project/[accessId]/customer-portal.jsx", import.meta.url), "utf8");
const sandbox = readFileSync(new URL("../app/project/[accessId]/sandbox-bar.jsx", import.meta.url), "utf8");

// ---------------------------------------------------------------- who may see money

test("the capability itself: a tech may not see the customer's financials", () => {
  for (const role of ["admin", "manager", "sales", "customer", "readonly"]) {
    assert.equal(can(role, "customer.financials.view"), true, `${role} may`);
  }
  assert.equal(can("tech", "customer.financials.view"), false, "a technician may not — this is the whole gate");
  assert.equal(can("vendor", "customer.financials.view"), false, "nor a vendor");
});

test("both money CTAs are gated on that capability, not on a role list", () => {
  // A hand-written `role === "tech"` check is exactly what the house rules forbid, and it is how the
  // vendor case gets missed.
  assert.match(gateway, /const canSeeMoney = can\(cView, "customer\.financials\.view"\);/);
  assert.match(gateway, /AWAITING_DEPOSIT:\s*canSeeMoney \?/, "deposit");
  assert.match(gateway, /AWAITING_FINAL_PAYMENT: canSeeMoney \?/, "final payment");
  assert.ok(!/AWAITING_FINAL_PAYMENT: \{ label: "Record Final Payment"/.test(gateway), "the ungated version is gone");
});

test("the money STATUS is suppressed too, not just its button", () => {
  // Leaving "Awaiting Final Payment" on screen with the button removed still tells a tech the job is
  // unpaid, which is the part they may not see.
  assert.match(gateway, /MONEY_STATES = new Set\(\["AWAITING_DEPOSIT", "AWAITING_FINAL_PAYMENT"\]\)/);
  assert.match(gateway, /status=\{as && !\(MONEY_STATES\.has\(projState\) && !canSeeMoney\)/);
});

test("the two money states are the ones the status engine calls money, and no others", () => {
  // If a new money state is added to project-status.js this test fails, which is the point.
  const moneyish = Object.keys(STATE_ACTION).filter((k) => /payment|deposit|invoice|balance/i.test(k));
  assert.deepEqual(moneyish.sort(), ["AWAITING_DEPOSIT", "AWAITING_FINAL_PAYMENT"],
    "a new money state must be added to MONEY_STATES in gateway-client.jsx");
  // and they really do read as money to a human
  assert.match(CUSTOMER_STATUS.AWAITING_FINAL_PAYMENT.label, /payment/i);
});

// ---------------------------------------------------------------- the demo bar

test("a sticky header starts below the demo bar instead of under it", () => {
  // The bar measures itself and publishes --sbx-h; every sticky top in the project view reads it, so
  // the fix holds whichever header is on screen rather than only the one that was reported.
  assert.match(sandbox, /--sbx-h/, "the bar still publishes its height");
  assert.match(sandbox, /\.sbx\{position:sticky;top:0;z-index:90/, "and still pins to the top");
  assert.match(portal, /\.cpv-head\{position:sticky;top:var\(--sbx-h,0px\);/, "portal header");
  assert.match(portal, /\.cpv-ovl-bar\{position:sticky;top:var\(--sbx-h,0px\);/, "overlay bar");
  assert.match(gateway, /\.pvx \.masthead\{position:sticky;top:var\(--sbx-h,0px\);/, "deck masthead");
  // nothing in the project view may still pin to a bare top:0 under the bar
  for (const [src, who] of [[portal, "customer-portal.jsx"], [gateway, "gateway-client.jsx"]]) {
    const bare = [...src.matchAll(/\.(cpv-head|cpv-ovl-bar|masthead)\{position:sticky;top:0/g)];
    assert.equal(bare.length, 0, `${who} still has a header pinned under the demo bar`);
  }
});

// ---------------------------------------------------------------- the QR

test("the activation QR is reachable from the portal home, for the customer too", () => {
  assert.match(gateway, /import SystemQrModal\s+from "\.\/system-qr-modal";/);
  assert.match(gateway, /lp\.system_qr && \{ key: "qr", label: "System QR"/, "an action, shown only when the QR exists");
  assert.match(gateway, /hubQrOpen && <SystemQrModal src=\{lp\.system_qr\}/, "and it opens the real viewer");
  // Not gated to staff: the customer is the person who scans it.
  const line = gateway.split("\n").find((l) => l.includes('key: "qr", label: "System QR"'));
  assert.ok(!/officeRole|canSeeMoney|role ===/.test(line), "no role gate on the customer's own QR");
});
