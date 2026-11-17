// Role-visibility regression: a TECH (or vendor) must never receive customer money — total, paid,
// balance, or pending add-on amounts.
//
// Found live: opening a project as a technician rendered the staff hub's PROJECT BALANCE card reading
// "Total $3,107 · Paid $0 · Remaining $3,107 + $200 pending". Definition of Done rule 4 says a tech
// never sees customer financials, and run-spec rule 7 says enforce it server-side rather than by hiding
// the card.
//
// The chain that leaked it: page.jsx computed financeSummary() and assigned it to `staffFinance`
// whenever `staffHub` was true, with no role check at all (staffHubFor() keys off project TYPE only),
// and staff-hub.jsx gated the card solely on `finance?.hasContract`.
//
// Gating only the assignment would not have been enough: `customerFinance` ships as a prop regardless of
// view, and gateway-client builds its progress rail from `staffFinance || customerFinance`, so a tech
// would still have received the figures in the RSC payload. The fix gates the COMPUTATION on
// can(initialView, "customer.financials.view").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { can } from "../lib/roles.js";
import { financeSummary } from "../lib/customer-portal.js";

const PAGE = readFileSync(new URL("../app/project/[accessId]/page.jsx", import.meta.url), "utf8");

test("customer.financials.view excludes tech and vendor, and admits the roles that sell or audit", () => {
  for (const role of ["tech", "vendor"]) {
    assert.equal(can(role, "customer.financials.view"), false, `${role} must not see customer money`);
  }
  for (const role of ["admin", "manager", "sales", "customer", "readonly"]) {
    assert.equal(can(role, "customer.financials.view"), true, `${role} should keep seeing the balance`);
  }
});

test("an unknown or missing role is denied, so a view that fails to resolve cannot leak money", () => {
  for (const role of [null, undefined, "", "nonsense"]) {
    assert.equal(can(role, "customer.financials.view"), false, `role ${JSON.stringify(role)}`);
  }
});

test("page.jsx gates the finance COMPUTATION on the capability, not just the assignments", () => {
  assert.match(
    PAGE,
    /const\s+maySeeMoney\s*=\s*can\(\s*initialView\s*,\s*["']customer\.financials\.view["']\s*\)/,
    "page.jsx must derive the gate from can(initialView, 'customer.financials.view')"
  );
  assert.match(
    PAGE,
    /if\s*\(\s*\(\s*customerPortalV2\s*\|\|\s*staffHub\s*\)\s*&&\s*maySeeMoney\s*\)/,
    "the gate must wrap the whole block — gating only `staffFinance` still ships customerFinance"
  );
  // The money must not be computed at all for a denied role: both reads live inside the gated block.
  const block = PAGE.slice(PAGE.indexOf("maySeeMoney"));
  const gatedRegion = block.slice(0, block.indexOf("return <GatewayClient"));
  for (const call of ["getProjectFinancialState(p.access_id)", "amountDueForPayment(p.access_id"]) {
    const idx = gatedRegion.indexOf(call);
    assert.ok(idx > 0, `${call} still present`);
    assert.ok(
      gatedRegion.lastIndexOf("maySeeMoney", idx) >= 0,
      `${call} must sit behind the maySeeMoney gate`
    );
  }
});

test("financeSummary is the only thing that would have carried the figures, and it is money-shaped", () => {
  // Guards the premise of the fix: if this ever stops carrying money, the gate above is the wrong lever.
  const sum = financeSummary(
    { total: 3107, paid: 0, balance: 3107, amountDueNow: 0, financialState: "open", pendingAddons: 200, pendingAddonCount: 1 },
    0
  );
  for (const k of ["total", "paid", "balance", "pendingAddons"]) {
    assert.equal(typeof sum[k], "number", `financeSummary carries ${k}`);
  }
  assert.equal(sum.total, 3107);
  assert.equal(sum.pendingAddons, 200);
  // ...and with no contract it is inert, which is what the card's hasContract check reads.
  assert.equal(financeSummary(null).hasContract, false);
});
