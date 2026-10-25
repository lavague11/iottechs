// Smart bulk sub-item update — the pure matching/apply core. Covers the spec's TEST A–F plus the canonical-key
// and mixed-value rules. The headline invariant: match SAME canonical type + SAME old value + scope; propagate;
// never overwrite an intentional override.
import test from "node:test";
import assert from "node:assert/strict";
import { bulkSubMatches, applyBulkSub, subKey, numEq } from "../lib/proposal-bulk.js";

// A camera block with one "Camera Mounting" sub at a given price (ids are deterministic for assertions).
let n = 0;
const block = (mountPrice, opt = "A", mkBase = true) => {
  const pid = `p${++n}`, sid = `s${n}`;
  return { id: pid, name: "Full Camera Install", qty: 1, price: 0, sub: [
    { id: `cam${n}`, name: "Camera", baseName: "Camera", qty: 1, price: 70 },
    { id: sid, name: "Camera Mounting", ...(mkBase ? { baseName: "Camera Mounting" } : {}), qty: 1, price: mountPrice },
  ] };
};
const payloadOf = (blocksByOpt) => ({ options: Object.entries(blocksByOpt).map(([id, blocks]) => ({ id, services: [{ key: "camera", items: blocks }] })) });
const mountIds = (p, optId) => p.options.find((o) => o.id === optId).services[0].items.flatMap((it) => it.sub.filter((s) => subKey(s) === "camera mounting").map((s) => ({ id: s.id, price: s.price })));

test("subKey prefers baseName, falls back to display name; numEq normalizes", () => {
  assert.equal(subKey({ baseName: "Camera Mounting", name: "Mounting (reno)" }), "camera mounting");
  assert.equal(subKey({ name: "Cat6 Termination" }), "cat6 termination");
  assert.ok(numEq("20", 20) && numEq(20, "20.00") && !numEq(20, 25));
});

test("TEST A — 7 matching @ $20; edit one → $25; prompt offers 6; update all → 7 become $25", () => {
  n = 0;
  const blocks = Array.from({ length: 7 }, () => block(20));
  const p = payloadOf({ A: blocks });
  const edited = blocks[0].sub[1];           // the first Camera Mounting
  edited.price = 25;                          // the single edit already applied to the payload
  const matches = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id });
  assert.equal(matches.length, 6, "6 other matches still at $20");
  // "Update all 7" = the 6 others + the edited one.
  const all = [...matches, { optionId: "A", itemId: blocks[0].id, subId: edited.id }];
  const next = applyBulkSub(p, all, "price", 25);
  assert.deepEqual(mountIds(next, "A").map((m) => m.price), [25, 25, 25, 25, 25, 25, 25]);
});

test("TEST B — 6 @ $20, 1 @ $35; editing a $20 → $25 updates only the $20s; $35 preserved", () => {
  n = 0;
  const blocks = [block(20), block(20), block(20), block(35), block(20), block(20), block(20)];
  const p = payloadOf({ A: blocks });
  const edited = blocks[0].sub[1]; edited.price = 25;
  const matches = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id });
  assert.equal(matches.length, 5, "5 OTHER $20 items (not the $35, not the edited)");
  assert.ok(!matches.some((m) => m.itemId === blocks[3].id), "the $35 override is excluded");
  const all = [...matches, { optionId: "A", itemId: blocks[0].id, subId: edited.id }];
  const next = applyBulkSub(p, all, "price", 25);
  const prices = mountIds(next, "A").map((m) => m.price);
  assert.deepEqual(prices, [25, 25, 25, 35, 25, 25, 25], "$35 intentional override untouched");
});

test("TEST C — scope: current option vs all options; no silent cross-option mutation", () => {
  n = 0;
  const A = [block(20, "A"), block(20, "A")];
  const B = [block(20, "B"), block(20, "B"), block(20, "B")];
  const p = payloadOf({ A, B });
  const edited = A[0].sub[1]; edited.price = 25;
  const cur = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id, allOptions: false });
  assert.equal(cur.length, 1, "current option: only the other A block");
  assert.ok(cur.every((m) => m.optionId === "A"));
  const all = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id, allOptions: true });
  assert.equal(all.length, 4, "all options: 1 in A + 3 in B");
  assert.deepEqual([...new Set(all.map((m) => m.optionId))].sort(), ["A", "B"]);
  // applying the current-option scope leaves B entirely at $20
  const next = applyBulkSub(p, [...cur, { optionId: "A", itemId: A[0].id, subId: edited.id }], "price", 25);
  assert.deepEqual(mountIds(next, "B").map((m) => m.price), [20, 20, 20], "option B never touched");
});

test("TEST D — applyBulkSub is immutable (original payload unchanged; current editable only)", () => {
  n = 0;
  const blocks = [block(20), block(20)];
  const p = payloadOf({ A: blocks });
  const before = JSON.parse(JSON.stringify(p));
  const matches = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20 });
  applyBulkSub(p, matches, "price", 25);
  assert.deepEqual(p, before, "input payload is not mutated — the new payload is returned");
});

test("TEST F — undo reverses the whole bulk atomically (apply oldValue to the same targets)", () => {
  n = 0;
  const blocks = Array.from({ length: 4 }, () => block(20));
  const p = payloadOf({ A: blocks });
  const edited = blocks[0].sub[1]; edited.price = 25;
  const others = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id });
  const all = [...others, { optionId: "A", itemId: blocks[0].id, subId: edited.id }];
  const applied = applyBulkSub(p, all, "price", 25);
  assert.deepEqual(mountIds(applied, "A").map((m) => m.price), [25, 25, 25, 25]);
  const undone = applyBulkSub(applied, all, "price", 20);   // same targets → oldValue
  assert.deepEqual(mountIds(undone, "A").map((m) => m.price), [20, 20, 20, 20], "all 4 reverted in one action");
});

test("mixed values (#14) — only the still-OLD matches are offered, not every same-name item", () => {
  n = 0;
  const blocks = [block(20), block(20), block(20), block(20), block(20), block(25), block(25), block(35)];
  const p = payloadOf({ A: blocks });
  const edited = blocks[0].sub[1]; edited.price = 30;   // a $20 → $30
  const matches = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id });
  assert.equal(matches.length, 4, "the other four $20s only (the $25s and $35 are left alone)");
});

test("legacy sub-items without baseName still match by display name", () => {
  n = 0;
  const blocks = [block(20, "A", false), block(20, "A", false), block(35, "A", false)];
  const p = payloadOf({ A: blocks });
  const edited = blocks[0].sub[1]; edited.price = 25;
  const matches = bulkSubMatches(p, { optionId: "A", serviceKey: "camera", matchKey: "camera mounting", field: "price", oldValue: 20, excludeSubId: edited.id });
  assert.equal(matches.length, 1, "the other $20 (name-matched); the $35 preserved");
});
