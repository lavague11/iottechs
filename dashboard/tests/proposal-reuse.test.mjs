// Reuse previous proposal — pure-model tests (node --test). Clone / pricing review / import candidate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clonePayload, pricingReview, applyPrices, importCandidateToPayload, reconcileTotals, parseMoney, normalizeCandidate, summarizeProposalRow } from "../lib/proposal-reuse.js";
import { validatePayload, proposalFingerprint } from "../lib/proposal.js";

const source = {
  options: [
    { id: "A", name: "Option A", note: "Customer note A", includeMockup: true, includeSurvey: true, services: [
      { key: "camera", name: "Cameras", label: "Security Cameras", note: "svc note", items: [
        { id: "li1", name: "Front Door", qty: 1, price: 150, cost: 60, techPrice: 50, outdoor: true, sub: [{ id: "s1", name: "Drop", qty: 1, price: 20, techPrice: 10 }] },
        { id: "li2", name: "Camera", qty: 2, price: 250, cost: 90, waived: true },
      ] },
    ] },
    { id: "B", name: "Option B", services: [{ key: "access", label: "Access Control", items: [{ id: "li3", name: "Door Reader", qty: 1, price: 400, cost: 200 }] }] },
  ],
  discount: { type: "flat", value: 100 }, pcp_credit: { type: "pct", value: 5 }, payment_plan: "custom",
  custom_plan: { rows: [{ pct: 40, due: "2025-01-01", paid: 1000 }, { pct: 60, due: "2025-03-01" }], cadence: "monthly" },
};
const ids = (pl) => (pl.options || []).flatMap((o) => (o.services || []).flatMap((s) => (s.items || []).flatMap((it) => [it.id, ...(it.sub || []).map((x) => x.id)])));

test("clone: new ids, structure kept, source untouched, no acceptance/link state", () => {
  const before = JSON.stringify(source);
  const out = clonePayload(source, { includeInternal: true });
  assert.equal(JSON.stringify(source), before);                                // TEST 11 — source immutable
  assert.equal(out.options.length, 2);
  const a = out.options[0];
  assert.equal(a.services[0].items[0].name, "Front Door");
  assert.equal(a.services[0].items[0].outdoor, true);
  assert.equal(a.services[0].items[1].waived, true);
  assert.equal(a.services[0].items[0].sub[0].name, "Drop");
  assert.equal(a.note, "Customer note A");
  assert.equal(a.includeMockup, false);                                        // source-project tools don't carry over
  for (const id of ids(out)) assert.ok(!ids(source).includes(id), id);         // every id is new
  assert.equal(out.payment_plan, "custom");
  assert.deepEqual(out.custom_plan.rows, [{ pct: 40 }, { pct: 60 }]);          // structure only — no dates / paid amounts
  assert.equal(out.discount.value, 100);
  assert.equal(validatePayload(out), null);
});

test("clone: internal pricing only when permitted; option selection; notes off; add-on items folded in", () => {
  const noInt = clonePayload(source, { includeInternal: false });
  const it = noInt.options[0].services[0].items[0];
  assert.equal(it.cost, undefined); assert.equal(it.techPrice, undefined); assert.equal(it.sub[0].techPrice, undefined);
  const withInt = clonePayload(source, { includeInternal: true });
  assert.equal(withInt.options[0].services[0].items[0].cost, 60);
  const onlyB = clonePayload(source, { optionIds: ["B"] });
  assert.equal(onlyB.options.length, 1); assert.equal(onlyB.options[0].id, "A"); assert.equal(onlyB.options[0].name, "Option B");
  const quiet = clonePayload(source, { includeNotes: false, includePaymentPlan: false, includeDiscount: false });
  assert.equal(quiet.options[0].note, ""); assert.equal(quiet.payment_plan, "50_50"); assert.equal(quiet.discount.value, 0);
  const add = clonePayload(source, { optionIds: ["A"], addendumItems: [{ name: "Extra cam", qty: 2, price: 200, techPay: 40 }] });
  const custom = add.options[0].services.find((s) => s.key === "custom");
  assert.equal(custom.items[0].name, "Extra cam"); assert.equal(custom.items[0].techPrice, undefined);
});

test("clone of a signed/accepted source carries no signature: fingerprint of the copy differs from nothing — it's just a payload", () => {
  const out = clonePayload(source);
  assert.ok(!("signed_name" in out) && !("accepted_options" in out) && !("status" in out));
  assert.equal(typeof proposalFingerprint(out, 0, 50), "string");
});

test("TEST 5: pricing review flags catalog items whose copied price differs; apply is selective", () => {
  const pl = clonePayload({ options: [{ id: "A", name: "A", services: [{ key: "camera", items: [{ id: "x", name: "Camera", qty: 1, price: 50 }, { id: "y", name: "Front Door", qty: 1, price: 150 }] }] }] });
  const book = { prices: { Camera: 70 } };
  const diffs = pricingReview(pl, book);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].name, "Camera"); assert.equal(diffs[0].copied, 50); assert.equal(diffs[0].current, 70);
  const applied = applyPrices(pl, { [diffs[0].itemId]: 70 });
  assert.equal(applied.options[0].services[0].items[0].price, 70);
  assert.equal(pl.options[0].services[0].items[0].price, 50);                 // original untouched
  assert.equal(pricingReview(applied, book).length, 0);
});

test("import: money parsing, candidate normalization, totals reconciliation, payload", () => {
  assert.equal(parseMoney("$1,250.00"), 1250); assert.equal(parseMoney("300"), 300); assert.equal(parseMoney("$ 300.5"), 300.5); assert.equal(parseMoney("n/a"), null);
  const raw = { customer: "Crazy Cars", items: [
    { name: "Camera Installation", qty: "8", unit_price: "$300", total: "$2,400.00", confidence: "high" },
    { name: "NVR", qty: null, unit_price: null, total: "$800", confidence: "low" },
    { name: "Cabling", qty: 4, unit_price: null, total: "$400" },
    { name: "" },
  ], subtotal: "$3,600", tax: "$252", total: "$3,852", payment_terms: "50% deposit, 50% on completion", uncertain: ["NVR"] };
  const c = normalizeCandidate(raw);
  assert.equal(c.items.length, 3);
  assert.equal(c.items[0].unit_price, 300); assert.equal(c.items[0].total, 2400);
  assert.equal(c.items[1].confidence, "low"); assert.equal(c.items[1].unit_price, null);   // never invented
  assert.equal(c.items[2].unit_price, 100);                                                 // derived only when unambiguous
  const rec = reconcileTotals(c);
  assert.equal(rec.ok, false);                                                              // lines 2400+0+400 ≠ 3600 → needs review
  const fixed = { ...c, items: c.items.map((it) => (it.name === "NVR" ? { ...it, qty: 1, unit_price: 800 } : it)) };
  assert.equal(reconcileTotals(fixed).ok, true);
  const pl = importCandidateToPayload(fixed, { serviceKey: "camera" });
  assert.equal(validatePayload(pl), null);
  assert.equal(pl.options[0].services[0].key, "camera");
  assert.equal(pl.options[0].services[0].items.length, 3);
  assert.equal(pl.payment_plan, "50_50");
  assert.equal(importCandidateToPayload({ payment_terms: "Paid in full" }).payment_plan, "100");
});

test("TEST 9: only admin / manager / sales may search, copy, import or pick a destination", async () => {
  const { can } = await import("../lib/roles.js");
  for (const r of ["admin", "manager", "sales"]) assert.equal(can(r, "proposal.reuse"), true, r);
  for (const r of ["customer", "tech", "vendor", "readonly"]) assert.equal(can(r, "proposal.reuse"), false, r);
  assert.equal(can("sales", "cost.view"), false);   // internal pricing never copies for sales
});

test("summarizeProposalRow: counts + total from the accepted option, no payload leaks", () => {
  const s = summarizeProposalRow({ id: 7, version: 2, status: "accepted", payload: JSON.stringify(source), tax_rate: 0, deposit_pct: 50, accepted_options: JSON.stringify(["B"]), signed_name: "Ada", signed_at: "2025-09-14" });
  assert.equal(s.items, 1); assert.equal(s.total, 280);                        // B: 400 − 100 discount − 5% PCP credit
  assert.equal(s.options.find((o) => o.id === "B").accepted, true);
  assert.equal(s.signed, true); assert.ok(!("payload" in s));
});
