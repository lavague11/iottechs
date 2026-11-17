// Customer / Internal halves of the project page — ONE role rule for both the cards and the toggle.
// Owner's rule: tech is internal-only (never the client's proposal), sales and manager get both and so
// get the toggle, vendor is customer-only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectGroups, seesProjectGroup, hasGroupToggle, defaultProjectGroup, ROLE_KEYS } from "../lib/roles.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("each role sees exactly the halves it should", () => {
  assert.deepEqual(projectGroups("admin"), ["customer", "internal"]);
  assert.deepEqual(projectGroups("manager"), ["customer", "internal"]);
  assert.deepEqual(projectGroups("sales"), ["customer", "internal"]);
  assert.deepEqual(projectGroups("tech"), ["internal"]);
  assert.deepEqual(projectGroups("vendor"), ["customer"]);
  assert.deepEqual(projectGroups("customer"), ["customer"]);
});

test("a tech never reaches the customer half; a vendor never reaches the internal half", () => {
  assert.equal(seesProjectGroup("tech", "internal"), true);
  assert.equal(seesProjectGroup("tech", "customer"), false, "no customer proposal for a tech");
  assert.equal(seesProjectGroup("vendor", "customer"), true);
  assert.equal(seesProjectGroup("vendor", "internal"), false, "no internal half for a vendor");
  // A card with no group declared counts as customer-facing — the safe default.
  assert.equal(seesProjectGroup("tech", undefined), false);
  assert.equal(seesProjectGroup("vendor", undefined), true);
});

test("the toggle renders only for a role that owns both halves", () => {
  for (const r of ["admin", "manager", "sales"]) assert.equal(hasGroupToggle(r), true, `${r} toggles`);
  for (const r of ["tech", "vendor", "customer", "readonly"]) assert.equal(hasGroupToggle(r), false, `${r} has nothing to toggle`);
});

test("a single-half role lands on that half, not on a half it cannot see", () => {
  assert.equal(defaultProjectGroup("tech"), "internal");
  assert.equal(defaultProjectGroup("vendor"), "customer", "vendor used to default to Internal");
  assert.equal(defaultProjectGroup("admin"), "customer");
  assert.equal(defaultProjectGroup("sales"), "customer");
});

test("an unknown role falls back to the customer half, never to internal", () => {
  for (const r of ["", null, undefined, "root", "superuser"]) {
    assert.deepEqual(projectGroups(r), ["customer"]);
    assert.equal(seesProjectGroup(r, "internal"), false);
  }
});

test("every declared role has an explicit rule — a new role cannot silently inherit internal", () => {
  for (const r of ROLE_KEYS) {
    const g = projectGroups(r);
    assert.ok(g.length >= 1, `${r} has at least one half`);
    assert.ok(g.every((x) => x === "customer" || x === "internal"), `${r} names only real halves`);
  }
});

test("the hub filters cards by the ROLE, not by which halves happen to have cards", () => {
  const hub = read("../app/project/[accessId]/staff-hub.jsx");
  assert.match(hub, /const allowed = projectGroups\(role\)/, "cards are filtered by role");
  assert.match(hub, /const mine = sections\.filter\(\(s\) => allowed\.includes\(s\.group \|\| "customer"\)\)/);
  assert.match(hub, /showToggle = hasGroupToggle\(role\)/, "the toggle asks the role, not the data");
  // The old fallback showed EVERY card to everyone whenever one half was empty.
  assert.doesNotMatch(hub, /showToggle \? sections\.filter/, "the un-toggled branch must not fall back to all sections");
  assert.match(hub, /showToggle \? mine\.filter/, "the un-toggled branch shows only the role's own half");
  // And no hand-rolled role strings deciding visibility (house rule: roles.js owns this).
  const gw = read("../app/project/[accessId]/gateway-client.jsx");
  assert.doesNotMatch(gw, /\["tech", "vendor"\]\.includes\(cView\)/, "the old vendor-gets-internal rule is gone");
  assert.match(gw, /defaultGroup=\{defaultProjectGroup\(cView\)\}/);
});

test("a demo is pinned to the current portal, never a project's legacy v1 override", () => {
  const db = read("../lib/db.js");
  const at = db.indexOf("export function createSandboxProject(");
  const fn = db.slice(at, db.indexOf("\nexport function", at + 10));
  assert.match(fn, /"portal_version"/, "portal_version is set explicitly");
  assert.match(fn, /skip = new Set\(\[[^\]]*"portal_version"/s, "and NOT copied from the source");
  assert.match(fn, /SANDBOX_SOURCE, "v2"/, "a demo always shows the current customer portal");
});

test("a fixed tool overlay starts below the demo bar, so its close button stays reachable", () => {
  const css = read("../app/project/[accessId]/customer-portal.jsx");
  assert.match(css, /\.cpv-ovl\{position:fixed;top:var\(--sbx-h,0\)/, "overlay offsets by the bar height");
  assert.doesNotMatch(css, /\.cpv-ovl\{position:fixed;inset:0/, "inset:0 put it under the bar");
  const bar = read("../app/project/[accessId]/sandbox-bar.jsx");
  assert.match(bar, /setProperty\("--sbx-h"/, "the bar publishes its measured height");
  assert.match(bar, /removeProperty\("--sbx-h"\)/, "and clears it when it unmounts");
});
