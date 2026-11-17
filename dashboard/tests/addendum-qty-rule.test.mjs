// B6 — one answer to "what does a missing quantity mean?".
//
// It used to have two. addendumTotals (the money formula, and what a signature binds to) counted a
// missing qty as 0; getApprovedAddons' item array reported it as 1, and cloneProposal copies that array
// straight into a new proposal draft — so an add-on that billed the customer $0 for a line came back as
// a real charge in the clone. proposal-reuse then applied `|| 1` a SECOND time, so fixing only the first
// site would have left the unit re-invented one call later.
//
// Resolved to 0 everywhere. Two reasons it is 0 rather than 1:
//   1. It cannot move money. Choosing 1 would mean changing addendumTotals, whose output is bound into
//      signedFingerprint — a signed add-on's total could shift. Choosing 0 leaves that formula untouched.
//   2. The house rule: never manufacture a number (cf. the service-call `needsPrice` line, which refuses
//      to invent a price rather than guessing one). A quantity nobody recorded is missing, not one.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addendumTotals } from "../lib/proposal.js";
import { clonePayload } from "../lib/proposal-reuse.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the money formula is unchanged: a missing qty still contributes nothing", () => {
  assert.equal(addendumTotals({ items: [{ name: "Camera", price: 300 }] }).total, 0);
  assert.equal(addendumTotals({ items: [{ name: "Camera", qty: 2, price: 300 }] }).total, 600);
  // qty 0 and a missing qty are the same thing, which is the whole point
  assert.equal(addendumTotals({ items: [{ name: "Camera", qty: 0, price: 300 }] }).total,
    addendumTotals({ items: [{ name: "Camera", price: 300 }] }).total);
});

test("the reported item qty now agrees with the money formula", () => {
  const src = read("../lib/db.js");
  assert.ok(src.includes("qty: +it.qty || 0, price: +it.price || 0"), "getApprovedAddons reports 0, not 1");
  assert.ok(!/qty: \+it\.qty \|\| 1/.test(src), "no `|| 1` left on the add-on item map");
});

test("a clone never invents a unit the add-on did not bill for", () => {
  // the add-on charged nothing for this line…
  const addon = { items: [{ name: "Spare bracket", price: 45 }] };
  assert.equal(addendumTotals(addon).total, 0);
  // …so the draft it is folded into must not charge for it either
  const payload = clonePayload(JSON.stringify({ options: [{ id: "A", name: "Option A", services: [] }] }),
    { addendumItems: [{ name: "Spare bracket", qty: 0, price: 45 }] });
  const line = payload.options[0].services.flatMap((s) => s.items).find((i) => i.name === "Spare bracket");
  assert.ok(line, "the line is still carried across — it is not silently dropped");
  assert.equal(line.qty, 0, "and it arrives with the quantity it actually had");
  assert.equal(line.price, 45, "the price is preserved, so staff can see and fix it");
  // a real quantity is untouched
  const p2 = clonePayload(JSON.stringify({ options: [{ id: "A", name: "Option A", services: [] }] }),
    { addendumItems: [{ name: "Camera", qty: 3, price: 250 }] });
  assert.equal(p2.options[0].services.flatMap((s) => s.items).find((i) => i.name === "Camera").qty, 3);
  assert.ok(!/qty: \+a\?\.qty \|\| 1/.test(read("../lib/proposal-reuse.js")), "the second `|| 1` is gone too");
});

test("live data is unaffected: no stored add-on line is missing a quantity", () => {
  // The rule only bites on data that does not exist here — the single writer normalises qty on the way
  // in (install-addendum.jsx). This pins that the writer still does, so the rule stays unreachable.
  assert.ok(read("../lib/addendum-items.js").includes("qty"), "the writer still sets qty explicitly");
});
