// Stage 2 item 2 — the change order renders through the PROPOSAL's renderer. The invariant that matters is
// that the two money formulas agree: optionTotals is what the PDF prints, addendumTotals is what the app
// charges and what the balance uses. A disagreement would put a different number on the signed document.
import test from "node:test";
import assert from "node:assert/strict";
import { addendumAsOption, addendumAsProposal, addendumPdfTotals } from "../lib/addendum-source.js";
import { addendumTotals } from "../lib/proposal.js";

const cases = [
  { name: "plain", add: { title: "Add-on", items: [{ id: "i1", name: "Camera", qty: 2, price: 400, service: "camera" }] } },
  { name: "discounted", add: { title: "Add-on", discount: 125, items: [{ id: "i1", name: "Camera", qty: 3, price: 400, service: "camera" }] } },
  { name: "taxed", add: { title: "Add-on", taxRate: 6.625, items: [{ id: "i1", name: "Speaker", qty: 4, price: 300, service: "sound" }] } },
  { name: "pcp", add: { title: "Add-on", pcpCredit: { type: "pct", value: 10 }, items: [{ id: "i1", name: "Cat6", qty: 1, price: 950, service: "wiring" }] } },
  { name: "all three", add: { title: "Add-on", discount: 100, taxRate: 8.875, pcpCredit: { type: "pct", value: 5 },
      items: [{ id: "i1", name: "Camera", qty: 2, price: 400, service: "camera" }, { id: "i2", name: "Mount", qty: 2, price: 75, service: "camera" }] } },
  { name: "awkward cents", add: { title: "Add-on", taxRate: 6.625, items: [{ id: "i1", name: "Thing", qty: 3, price: 333.33, service: "custom" }] } },
  { name: "zero qty line", add: { title: "Add-on", items: [{ id: "i1", name: "Freebie", qty: 0, price: 500, service: "custom" }] } },
];

for (const c of cases) {
  test(`the PDF prints the same total the app charges — ${c.name}`, () => {
    const { rendered, charged, agree } = addendumPdfTotals(c.add);
    assert.ok(agree, `rendered ${rendered.grand} vs charged ${charged.total}`);
    assert.equal(rendered.discount, charged.discount, "same discount");
    assert.equal(rendered.pcpCredit, charged.pcpCredit, "same credit");
    assert.equal(rendered.tax, charged.tax, "same tax");
  });
}

test("the add-on becomes ONE option, keeping its own service grouping", () => {
  const opt = addendumAsOption(cases[4].add);
  assert.equal(opt.id, "A");
  assert.equal(opt.services.length, 1, "both lines are camera service");
  assert.equal(opt.services[0].items.length, 2);
  assert.equal(addendumAsOption({ items: [] }).services.length, 1, "an empty add-on still has a service shell");
});

test("the proposal shape is never signed, never accepted, and carries no deposit or plan", () => {
  const p = addendumAsProposal(cases[0].add, { projectId: "ASC0001" });
  assert.equal(p.signed_at, null);
  assert.equal(p.signed_name, null);
  assert.deepEqual(p.accepted_options, []);
  assert.equal(p.deposit_pct, 0, "an add-on has no deposit of its own");
  assert.equal(p.payload.payment_plan, null, "and no second payment schedule");
});

test("a discount is passed as FLAT dollars — an add-on's discount is never a percentage", () => {
  const p = addendumAsProposal({ discount: 125, items: [{ name: "x", qty: 1, price: 1000 }] });
  assert.deepEqual(p.payload.discount, { type: "flat", value: 125 });
  assert.equal(addendumTotals({ discount: 125, items: [{ name: "x", qty: 1, price: 1000 }] }).total, 875);
});
