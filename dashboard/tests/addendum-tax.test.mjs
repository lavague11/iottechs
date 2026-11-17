// B1 — tax on a change order, opt-in per add-on.
//
// The owner's rule: "Tax is not on all customers. It's only if we click it." 56 of the 84 proposals in
// the live database carry tax_rate 0, so inheriting the proposal's rate onto its add-ons would invent
// tax on add-ons nobody taxed AND restate ones already signed. Instead the add-on carries its OWN
// taxRate, absent until someone clicks it, exactly like the proposal's NJ/NY control.
//
// The load-bearing tests here are the backward-compatibility pair: an add-on with no taxRate must
// produce the same total AND the same fingerprint as it did before tax existed. If the fingerprint
// moved, every already-signed add-on would stop matching its stored signedFingerprint, drop out of
// getApprovedAddons, and silently subtract itself from a live balance.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addendumTotals, addendumFingerprint, addendumSignatureCurrent } from "../lib/proposal.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ADDON = { title: "Added 3 back-lot cameras", items: [{ name: "Camera", qty: 3, price: 250 }] };

test("no taxRate ⇒ the untaxed formula, unchanged", () => {
  for (const a of [ADDON, { ...ADDON, taxRate: 0 }, { ...ADDON, taxRate: null }, { ...ADDON, taxRate: "" }, { ...ADDON, taxRate: "abc" }]) {
    const t = addendumTotals(a);
    assert.equal(t.total, 750, "total is subtotal − discount, with nothing added");
    assert.equal(t.tax, 0);
    assert.equal(t.taxRate, 0);
  }
  // discount still floors the total at 0, and an absent rate cannot resurrect it
  assert.equal(addendumTotals({ ...ADDON, discount: 9999 }).total, 0);
});

test("a clicked rate taxes the discounted net, mirroring optionTotals", () => {
  assert.equal(addendumTotals({ ...ADDON, taxRate: 6.625 }).total, 799.69);        // 750 + 49.69
  assert.equal(addendumTotals({ ...ADDON, taxRate: 6.625 }).tax, 49.69);
  // tax is charged on the NET, not the gross: (750 − 100) × 6.625%
  const d = addendumTotals({ ...ADDON, discount: 100, taxRate: 6.625 });
  assert.equal(d.tax, 43.06);
  assert.equal(d.total, 693.06);
  // a discount beyond the subtotal leaves nothing to tax
  assert.equal(addendumTotals({ ...ADDON, discount: 9999, taxRate: 8.875 }).tax, 0);
  assert.equal(addendumTotals({ ...ADDON, discount: 9999, taxRate: 8.875 }).total, 0);
});

test("the fingerprint of an UNTAXED add-on is byte-identical to the pre-tax hash", () => {
  // The hash the old two-term formula produced, recomputed here from first principles so this test
  // fails if the meaning object ever gains an unconditional key.
  const stable = (v) => v === null || typeof v !== "object" ? JSON.stringify(v)
    : Array.isArray(v) ? "[" + v.map(stable).join(",") + "]"
    : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h |= 0; } return (h >>> 0).toString(36); };
  const legacy = hash(stable({ t: ADDON.title, d: 0, items: [{ n: "Camera", q: 3, p: 250 }] }));

  assert.equal(addendumFingerprint(ADDON), legacy, "an add-on with no tax hashes exactly as before");
  assert.equal(addendumFingerprint({ ...ADDON, taxRate: 0 }), legacy, "an explicit 0 is the same as absent");

  // …so a signature taken before this change still matches, and the money stays on the balance.
  const signed = { ...ADDON, status: "approved", signedName: "Jane Customer", signedFingerprint: legacy };
  assert.ok(addendumSignatureCurrent(signed), "an already-signed untaxed add-on still counts");
  assert.equal(addendumTotals(signed).total, 750, "and still for the same amount");
});

test("clicking tax after signing voids the signature instead of raising the price quietly", () => {
  const signed = { ...ADDON, status: "approved", signedName: "Jane Customer" };
  signed.signedFingerprint = addendumFingerprint(signed);
  assert.ok(addendumSignatureCurrent(signed));

  const taxed = { ...signed, taxRate: 6.625 };
  assert.notEqual(addendumFingerprint(taxed), signed.signedFingerprint, "the rate is part of what was agreed");
  assert.ok(!addendumSignatureCurrent(taxed), "so the approval no longer covers it — re-sign required");
  // reconcileAddendumWrite reads exactly this to drop the add-on back to pending
  assert.ok(read("../app/project/[accessId]/proposal-actions.js").includes("a.signedFingerprint !== addendumFingerprint(a)"));
});

test("tax starts off, is never inherited from the proposal, and only a pricing role sets it", () => {
  const b = read("../app/project/[accessId]/addendum-builder.jsx");
  assert.match(b, /useState\(init\?\.taxRate \|\| 0\)/, "the control defaults to 0 — off until clicked");
  assert.ok(!/tax_rate/.test(b), "the builder never reads the proposal's own tax_rate");
  // the control and the Tax row both sit behind canPrice / conditional display
  assert.match(b, /canPrice && \(\s*\n\s*<div className="adn-b-tax"/, "the tax control is pricing-only");
  assert.match(b, /totals\.tax > 0 &&/, "the tax figure shows only when it moves the price");

  // server-side: a role that may not price keeps the stored rate, whatever it posts
  const actions = read("../app/project/[accessId]/proposal-actions.js");
  assert.match(actions, /a\.taxRate = prev \? prev\.taxRate : undefined/, "non-pricing writes can't set tax");
  // and a role without retail sight never receives it over the wire (both read paths)
  assert.ok(actions.includes("delete out.discount; delete out.taxRate;"), "sanitizeToolRead strips the rate");
  assert.ok(read("../app/api/addendum/route.js").includes("delete out.discount; delete out.taxRate;"), "/api/addendum strips it too");
});

test("every surface reads the one formula, so a taxed add-on is the same number everywhere", () => {
  // The total flows automatically wherever addendumTotals(...).total is already used — the balance
  // (getApprovedAddons), the AR list, the invoice model and the version snapshot. What needed adding
  // was the visible tax ROW on the two customer-facing documents.
  assert.ok(read("../lib/addendum-pdf.js").includes("if (tax > 0)"), "the change-order PDF prints a tax row when taxed");
  assert.ok(read("../lib/email.js").includes("addTot.tax > 0"), "the approval email states the tax");
  assert.ok(read("../app/project/[accessId]/install-addendum.jsx").includes("addendumTotals(a).tax > 0"), "the add-on card shows it");
  // no second tax formula anywhere
  const all = ["../lib/addendum-pdf.js", "../lib/email.js", "../app/project/[accessId]/install-addendum.jsx", "../app/project/[accessId]/addendum-builder.jsx"];
  for (const f of all) assert.ok(!/taxRate\s*\/\s*100/.test(read(f)), `${f} must not re-derive tax — addendumTotals owns it`);
});

test("PCP is deliberately NOT applied to an add-on", () => {
  // The PCP credit is a proposal-level figure already subtracted from the proposal total by
  // optionTotals. Subtracting it again on an add-on would credit the same money twice.
  const t = addendumTotals({ ...ADDON, pcpCredit: 100, pcp_credit: 100 });
  assert.equal(t.total, 750, "an add-on ignores a PCP figure handed to it");
  assert.ok(read("../lib/proposal.js").includes("PCP is NOT applied here"), "and the reason is recorded where the formula lives");
});
