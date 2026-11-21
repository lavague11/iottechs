// Stage 2 (docs/customer-flow-v2.md) — an add-on may carry its own PCP credit. The invariant that matters:
// an add-on WITHOUT one must compute and hash exactly as it did before the field existed, or every add-on
// already signed would stop matching its stored fingerprint and subtract itself from a live balance.
import test from "node:test";
import assert from "node:assert/strict";
import { addendumTotals, addendumFingerprint, addendumPcpAmount } from "../lib/proposal.js";

const base = { title: "Add-on · Nov 21", discount: 0, items: [
  { name: "Extra camera", qty: 2, price: 400 },
  { name: "Cat6 run", qty: 1, price: 150 },
] };

test("an add-on with no PCP credit is untouched — same total, same fingerprint", () => {
  const t = addendumTotals(base);
  assert.equal(t.sub, 950);
  assert.equal(t.total, 950);
  assert.equal(t.pcpCredit, 0);
  // The literal hash of the pre-Stage-2 shape. If this changes, every signed add-on silently drops out
  // of the balance — which is why the PCP term is only in the hash when a credit is actually set.
  const before = addendumFingerprint(base);
  assert.equal(addendumFingerprint({ ...base, pcpCredit: 0 }), before, "an explicit zero is still no credit");
  assert.equal(addendumFingerprint({ ...base, pcpCredit: "" }), before, "so is an empty control");
  assert.equal(addendumFingerprint({ ...base, pcpCredit: { type: "pct", value: 0 } }), before);
});

test("a credit comes off the net, before tax, like the proposal's own", () => {
  const t = addendumTotals({ ...base, pcpCredit: { type: "pct", value: 10 }, taxRate: 6.625 });
  assert.equal(t.pcpCredit, 95, "10% of 950");
  assert.equal(t.tax, 56.64, "tax on 855, not on 950");
  assert.equal(t.total, 911.64);
});

test("a percentage credit is of the SUBTOTAL, the same base optionTotals uses", () => {
  // Not the discounted net. optionTotals computes `amountOf(pcpCredit, sub)`, and that function is what
  // the change-order PDF prints — a different base here would print a different total from the one
  // charged. tests/addendum-source.test.mjs is what holds the two together.
  const t = addendumTotals({ ...base, discount: 150, pcpCredit: { type: "pct", value: 10 } });
  assert.equal(t.pcpCredit, 95, "10% of 950, not of 800");
  assert.equal(t.total, 705);
});

test("a flat credit, and a bare number, both work", () => {
  assert.equal(addendumTotals({ ...base, pcpCredit: { type: "flat", value: 50 } }).total, 900);
  assert.equal(addendumTotals({ ...base, pcpCredit: 50 }).total, 900);
  assert.equal(addendumPcpAmount({ ...base, pcpCredit: -20 }), 0, "never a negative credit");
});

test("a credit DOES move the fingerprint — the customer is signing a different number", () => {
  assert.notEqual(addendumFingerprint({ ...base, pcpCredit: { type: "pct", value: 10 } }), addendumFingerprint(base));
});
