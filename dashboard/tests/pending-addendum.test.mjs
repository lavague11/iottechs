// Part A — pending addendums shown as a separate balance line, NOT billed until approved.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addendumAwaitingCustomer } from "../lib/proposal.js";

const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
const fin = readFileSync(new URL("../lib/customer-portal.js", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/project/[accessId]/customer-portal.jsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../app/project/[accessId]/staff-hub.jsx", import.meta.url), "utf8");

test("getPendingAddons collects pending, priced, non-voided add-ons; excluded from billed total", () => {
  assert.ok(db.includes("export function getPendingAddons"), "getPendingAddons exists");
  const fn = db.slice(db.indexOf("export function getPendingAddons"), db.indexOf("export function getPendingAddons") + 700);
  // B13 replaced the inline filter with the ONE shared predicate, so the money line, the banner and
  // the Sign CTA cannot disagree. Assert the rule it applies, not the literal it used to be spelled with.
  assert.ok(fn.includes("filter(addendumAwaitingCustomer)"), "it reads the shared predicate");
  assert.equal(addendumAwaitingCustomer({ status: "pending" }), true, "pending + priced is pending");
  assert.equal(addendumAwaitingCustomer({ status: "pending", needsPricing: true }), false, "unpriced is not");
  assert.equal(addendumAwaitingCustomer({ status: "approved" }), false, "approved is not");
  assert.equal(addendumAwaitingCustomer({ status: "voided" }), false, "voided is not");
  // The billed total still uses ONLY approved add-ons — pending never inflates it.
  assert.ok(db.includes("const total = grand + (getApprovedAddons(accessId)?.total || 0);"), "total bills approved add-ons only");
  assert.ok(db.includes("pendingAddons: pendAdd.total") && db.includes("pendingAddonCount: pendAdd.count"), "finance state carries pending separately");
});

test("financeSummary passes pendingAddons through (sanitized)", () => {
  assert.ok(fin.includes("pendingAddons:") && fin.includes("pendingAddonCount:"), "summary exposes pending add-ons");
});

// Section M: the balance card is ONE shared component (portal-balance.jsx) used by both portals.
const balance = readFileSync(new URL("../app/project/[accessId]/portal-balance.jsx", import.meta.url), "utf8");
test("both portals mount the shared balance card", () => {
  assert.ok(portal.includes("<PortalBalance ") && hub.includes("<PortalBalance "));
});

test("the shared balance UI renders the pending line (amber, informational)", () => {
  for (const [name, src] of [["shared balance", balance]]) {
    assert.ok(src.includes("cpv-balpend") && src.includes("awaiting approval"), `${name} shows the pending add-on row`);
    assert.ok(src.includes("cpv-pendplus") && src.includes("pending</span>"), `${name} annotates Remaining with "+ $X pending"`);
    assert.ok(src.includes("finance.pendingAddons > 0"), `${name} only shows it when there is a pending add-on`);
  }
});
