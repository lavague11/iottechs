// Section G — the Addendum reuses the Proposal's item picker. The pure boundary (lib/addendum-items.js) must
// produce the same fields a Proposal preset does, map techPay <-> techPrice explicitly, and never disturb
// what a customer signature binds to (addendumFingerprint).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  makePresetBlock, presetsForService, itemTotal, priceOf, addendumFingerprint, addendumTotals,
  addendumSignatureCurrent, defaultTechPayout,
} from "../lib/proposal.js";
import {
  lineToAddendumItem, servicesToAddendumItems, addendumItemsToServices, techPayOf, addendumTypeOf,
} from "../lib/addendum-items.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const RATES = { cam_drop: 60, cam_mgmt: 15, cam_term: 10, cam_mount: 20, cam_program: 10, cam_waterproof: 5 };
const book = {};

test("a preset chosen in the addendum yields the same fields as the same preset in the Proposal", () => {
  const preset = presetsForService("camera", book).find((p) => p.id === "full-camera");
  const block = makePresetBlock(preset, book);              // the exact call the Proposal's preset chip makes
  const it = lineToAddendumItem(block, "camera", { rates: RATES });
  assert.equal(it.name, block.name);
  assert.equal(it.price, itemTotal(block), "customer price = the proposal block's own total");
  assert.equal(it.price, block.sub.reduce((s, x) => s + x.qty * priceOf(x.baseName, book), 0), "every part priced from the book");
  assert.equal(it.qty, 1);
  assert.equal(it.id, block.id, "line id is preserved");
  assert.equal(it.type, "camera");
  assert.equal(it.service, "camera");
  // tech pay auto-fills from the rate book: drop+mgmt, termination, mounting, programming, waterproofing
  assert.equal(it.techPay, 60 + 15 + 10 + 20 + 10 + 5);
});

test("+ Item picks a catalog entry: flat line carries name/price, tech pay auto-fills from the rate book", () => {
  const line = { id: "l1", name: "Cat6 Drop", qty: 3, price: 150, cost: 12 };
  const it = lineToAddendumItem(line, "camera", { rates: RATES });
  assert.deepEqual({ ...it }, { id: "l1", name: "Cat6 Drop", type: "equip", service: "camera", qty: 3, price: 150, techPay: defaultTechPayout("Cat6 Drop", "camera", RATES) });
  assert.equal(it.techPay, 75);
  assert.ok(!("cost" in it), "addendum items carry no cost");
  assert.equal(lineToAddendumItem({ id: "c", name: "4K Dome Camera", qty: 1, price: 175 }, "camera", {}).type, "camera");
});

test("techPay <-> techPrice is mapped explicitly in both directions", () => {
  // proposal -> addendum: an explicit techPrice wins over the rate-book default
  const out = lineToAddendumItem({ id: "x", name: "Cat6 Drop", qty: 2, price: 150, techPrice: 99 }, "camera", { rates: RATES });
  assert.equal(out.techPay, 99);
  assert.ok(!("techPrice" in out), "never writes techPrice into the addendum blob");
  // addendum -> proposal line: techPay comes back as techPrice, never as `cost`
  const [svc] = addendumItemsToServices([{ id: "x", name: "Cat6 Drop", type: "equip", qty: 2, price: 150, techPay: 99 }]);
  assert.equal(svc.items[0].techPrice, 99);
  assert.equal(svc.items[0].cost, 0);
  assert.equal(svc.items[0].price, 150);
  // and survives the round trip
  assert.equal(servicesToAddendumItems([svc], { rates: RATES })[0].techPay, 99);
  // an office-typed override beats both
  assert.equal(lineToAddendumItem({ id: "x", name: "Cat6 Drop", qty: 1, price: 1 }, "camera", { rates: RATES, payOverrides: { x: "12" } }).techPay, 12);
  // a block's explicit pay is the total, not per part
  assert.equal(techPayOf({ id: "b", name: "Rear", techPrice: 80, sub: [{ name: "Camera Mounting", qty: 1 }] }, "camera", RATES), 80);
});

test("a role that may not price writes no price and no payout (tech add-on lands needsPricing, unpriced)", () => {
  const services = [{ key: "camera", label: "Security Cameras", items: [makePresetBlock(presetsForService("camera", book)[0], book), { id: "f", name: "Cat6 Drop", qty: 2, price: 150 }] }];
  const items = servicesToAddendumItems(services, { rates: RATES, priced: false });
  assert.equal(items.length, 2);
  items.forEach((it) => { assert.equal(it.price, 0); assert.equal(it.techPay, 0); });
  assert.equal(addendumTotals({ items, discount: 0 }).total, 0);
  const ui = read("../app/project/[accessId]/install-addendum.jsx");
  assert.ok(ui.includes("needsPricing: !canPrice ? true : undefined"), "anyone without addendum.price flags the add-on for office pricing");
  const b = read("../app/project/[accessId]/addendum-builder.jsx");
  assert.ok(b.includes("priced: canPrice"), "builder only prices for a role that may price");
  // the server still enforces it (reconcileAddendumWrite), independent of the UI
  const actions = read("../app/project/[accessId]/proposal-actions.js");
  assert.ok(/if \(!mayPrice\)[\s\S]{0,400}price: p\.price, techPay: p\.techPay[\s\S]{0,200}price: 0, techPay: 0/.test(actions), "server keeps stored prices for non-pricers");
});

test("signature preservation: the fingerprint ignores everything the picker adds, and existing hashes are unchanged", () => {
  const legacy = { title: "Added 3 rear cameras", discount: 25, items: [
    { id: "a1", name: "Dome Camera", type: "camera", qty: 3, price: 175, techPay: 40 },
    { id: "a2", name: "Cat6 Drop", type: "equip", qty: 3, price: 150, techPay: 60 }] };
  // pinned: computed from addendumFingerprint at HEAD, before this work (1grymej)
  assert.equal(addendumFingerprint(legacy), "1grymej");
  // the same content built through the new picker (extra `service` field, different techPay, other type) hashes the same
  const viaPicker = { ...legacy, items: legacy.items.map((it) => ({ ...it, service: "camera", techPay: 7, type: "equip" })) };
  assert.equal(addendumFingerprint(viaPicker), "1grymej");
  // a signed add-on stays current; a price change still voids it (re-sign)
  const signed = { ...legacy, status: "approved", signedFingerprint: "1grymej" };
  assert.equal(addendumSignatureCurrent(signed), true);
  assert.equal(addendumSignatureCurrent({ ...signed, items: [{ ...legacy.items[0], price: 176 }, legacy.items[1]] }), false);
  // editing a signed add-on's items through the picker round trip leaves the fingerprint alone
  const rt = servicesToAddendumItems(addendumItemsToServices(legacy.items), { rates: RATES });
  assert.equal(addendumFingerprint({ ...legacy, items: rt }), "1grymej");
});

test("stored shape is not reshaped: the only new field is `service`", () => {
  const it = lineToAddendumItem({ id: "z", name: "Speaker", qty: 2, price: 50 }, "sound", {});
  assert.deepEqual(Object.keys(it).sort(), ["id", "name", "price", "qty", "service", "techPay", "type"]);
  assert.equal(addendumTypeOf({ name: "x", sub: [{}] }, "sound"), "speaker");
  assert.equal(addendumTypeOf({ name: "x", sub: [{}] }, "toast"), "pos");
  assert.equal(addendumTypeOf({ name: "16-Channel NVR" }, "camera"), "nvr");
});

test("addendumTotals stays the only add-on total (no second formula in the picker)", () => {
  const b = read("../app/project/[accessId]/addendum-builder.jsx");
  const lib = read("../lib/addendum-items.js");
  assert.ok(b.includes("addendumTotals"));
  assert.ok(!/\*\s*\(\+it\??\.price/.test(b) && !/\*\s*\(\+it\??\.price/.test(lib), "no qty*price sum outside addendumTotals");
  assert.ok(!/- \(?\+?discount/.test(b), "no discount subtraction either");
});

test("one picker: ItemNameField and ServiceAdder are shared modules, not copies", () => {
  const editor = read("../app/project/[accessId]/proposal-items-editor.jsx");
  const builder = read("../app/project/[accessId]/proposal-builder.jsx");
  const adn = read("../app/project/[accessId]/addendum-builder.jsx");
  assert.ok(/function ItemNameField/.test(read("../app/project/[accessId]/item-name-field.jsx")));
  assert.ok(/function ServiceAdder/.test(read("../app/project/[accessId]/service-adder.jsx")));
  assert.ok(!/function ItemNameField/.test(editor) && !/function ServiceAdder/.test(builder));
  assert.ok(editor.includes('from "./item-name-field"') && builder.includes('from "./service-adder"'));
  assert.ok(adn.includes('from "./service-adder"') && adn.includes('from "./proposal-items-editor"'), "addendum builder mounts the proposal's editor + service picker");
  const inst = read("../app/project/[accessId]/install-addendum.jsx");
  assert.ok(inst.split("\n").length < 500, "install-addendum.jsx stays under 500 lines");
  assert.ok(!/Customer price|Tech pay/.test(inst), "manual Item/Type/price form is gone");
});

// ---- round 2 ---------------------------------------------------------------------------------------------

test("editing round trip is an identity map for untouched legacy lines (order, whitespace, qty 0)", () => {
  // Mixed-type legacy order — grouping by service must not reorder it; odd names/qty must not be normalised.
  const items = [
    { id: "i1", name: "Dome Camera", type: "camera", qty: 2, price: 175, techPay: 40 },
    { id: "i2", name: "Cat6 Drop ", type: "equip", qty: 3, price: 150, techPay: 0 },      // trailing space
    { id: "i3", name: "Bullet Camera", type: "camera", qty: 0, price: 120, techPay: 0 },   // qty 0
    { id: "i4", name: "Panel", type: "pos", qty: 1, price: 90 },
  ];
  const a = { title: "Legacy", discount: 10, items };
  const fp = addendumFingerprint(a);
  const rt = servicesToAddendumItems(addendumItemsToServices(items), { rates: RATES, original: items });
  assert.deepEqual(rt.map((i) => i.id), ["i1", "i2", "i3", "i4"], "stored order kept");
  assert.equal(rt[1].name, "Cat6 Drop ", "legacy name left alone");
  assert.equal(rt[2].qty, 0, "legacy qty 0 left alone");
  assert.equal(addendumFingerprint({ ...a, items: rt }), fp, "a signed add-on's hash survives the editor");
  // without `original` the lines are normalised (new-build path) — proves the guard is what keeps identity
  assert.notEqual(addendumFingerprint({ ...a, items: servicesToAddendumItems(addendumItemsToServices(items), { rates: RATES }) }), fp);
  // touching one line changes only that line; new lines append after the stored ones
  const svcs = addendumItemsToServices(items);
  svcs[0].items[0].price = 180;
  svcs.push({ key: "custom", label: "Custom", items: [{ id: "n1", name: "  New Thing ", qty: 1, price: 5, cost: 0 }] });
  const edited = servicesToAddendumItems(svcs, { rates: RATES, original: items });
  assert.deepEqual(edited.map((i) => i.id), ["i1", "i2", "i3", "i4", "n1"]);
  assert.equal(edited[0].price, 180);
  assert.equal(edited[1].name, "Cat6 Drop ");
  assert.equal(edited[4].name, "New Thing");
  // a deleted line is dropped
  svcs[0].items = svcs[0].items.filter((l) => l.id !== "i3");
  assert.deepEqual(servicesToAddendumItems(svcs, { original: items }).map((i) => i.id), ["i1", "i2", "i4", "n1"].filter((id) => id !== "i2" || true));
});

test("a blank-named legacy line is kept when untouched", () => {
  const items = [{ id: "b1", name: "", qty: 1, price: 5 }, { id: "b2", name: "Real", qty: 1, price: 7 }];
  const rt = servicesToAddendumItems(addendumItemsToServices(items), { original: items });
  assert.deepEqual(rt.map((i) => i.id), ["b1", "b2"]);
});

test("flat lines keep their install typing (speaker, pos, nvr, camera); labor lines stay equipment", () => {
  assert.equal(lineToAddendumItem({ id: "s", name: "Ceiling Speaker", qty: 4, price: 100 }, "sound", {}).type, "speaker");
  assert.equal(lineToAddendumItem({ id: "w", name: "Speaker Wire Run", qty: 4, price: 50 }, "sound", {}).type, "equip");
  assert.equal(lineToAddendumItem({ id: "t", name: "Kitchen Printer", qty: 1, price: 50 }, "toast", {}).type, "pos");
  assert.equal(lineToAddendumItem({ id: "d", name: "Line Drop", qty: 1, price: 150 }, "toast", {}).type, "equip");
  assert.equal(lineToAddendumItem({ id: "n", name: "16-Channel NVR", qty: 1, price: 500 }, "camera", {}).type, "nvr");
  assert.equal(lineToAddendumItem({ id: "c", name: "4K Dome Camera", qty: 1, price: 175 }, "camera", {}).type, "camera");
});

test("a waived flat line keeps its quantity (price 0); only a bundle collapses to one line", () => {
  const w = lineToAddendumItem({ id: "w", name: "Camera", qty: 3, price: 175, waived: true }, "camera", { rates: RATES });
  assert.equal(w.qty, 3);
  assert.equal(w.price, 0);
  const block = makePresetBlock(presetsForService("camera", book)[0], book);
  assert.equal(lineToAddendumItem(block, "camera", { rates: RATES }).qty, 1);
});

test("a non-pricer's editor renders no price: money is blanked, inputs/labels/titles/catalog prices are not drawn", () => {
  const ed = read("../app/project/[accessId]/proposal-items-editor.jsx");
  const nf = read("../app/project/[accessId]/item-name-field.jsx");
  assert.ok(ed.includes('const money = hidePrices ? () => "" : fmtMoney;'), "every in-body money() renders blank");
  // each editable price input is skipped (not just hidden) when hidePrices is on
  for (const cls of ['className="num prop-line-amt"', 'className="num prop-sub2-amt prop-sub2-amt-edit" type="number" min="0"']) {
    const at = ed.indexOf(cls); assert.ok(at > 0, cls);
    assert.ok(ed.slice(Math.max(0, at - 160), at).includes("hidePrices"), `${cls} is gated by hidePrices`);
  }
  assert.ok(ed.includes("(x.waived && strikeWaived) || hidePrices ?"), "sub-row price input swapped for an empty span");
  // accessible strings: every removeLabel / title that carried money is gated
  for (const m of ed.matchAll(/removeLabel=\{[^\n]*money\([^\n]*/g)) assert.ok(/hidePrices/.test(m[0]), `removeLabel gated: ${m[0].slice(0, 60)}`);
  assert.ok(!/title="[^"]*\(\$\d+\)/.test(ed), "no literal $ amount left in a static title");
  assert.ok(ed.includes('hidePrices ? "" : money(itemTotal') && ed.includes("hidePrices={hidePrices} svcLabel"), "waive modal amount covered");
  // amtOf(x) is x.price in retail mode (x.techPrice in the work order's payout mode) — same column, one read.
  assert.ok(ed.includes("× {money(amtOf(x))}") && /const amtOf = \(it\) => \(\+it\?\.\[AMT\] \|\| 0\);/.test(ed)
    && /!hidePrices && q > 1/.test(ed) && /!hidePrices && \(\+bi\.qty/.test(ed), "qty x price math skipped");
  assert.equal((ed.match(/hidePrice=\{hidePrices\}/g) || []).length, 2, "both type-ahead fields hide catalog prices");
  assert.ok(nf.includes("!hidePrice &&") && nf.includes("prop-name-opt-price"));
  // the builder turns it on for every role without addendum.price, and no CSS-hide shortcut remains
  const b = read("../app/project/[accessId]/addendum-builder.jsx");
  assert.ok(b.includes("hidePrices={!canPrice}"));
  assert.ok(!/visibility:hidden/.test(b));
});

test("the service gear offers only live actions: Pricing & presets needs onOpenPricing, Waive Items needs a pricer", () => {
  const ed = read("../app/project/[accessId]/proposal-items-editor.jsx");
  assert.ok(ed.includes("{onPricing && <button"), "menu item hidden when no handler");
  assert.ok(ed.includes("onPricing={onOpenPricing ? () => onOpenPricing(svc.key) : null}"), "no handler -> null, not a dead closure");
  assert.ok(ed.includes("svcWaivable.length && !hidePrices"), "waive is a pricing decision");
  assert.ok(ed.includes("(onPricing || canImport || onWaiveItems) && <div"), "no orphan separator above Remove service");
  assert.ok(!/onOpenPricing/.test(read("../app/project/[accessId]/addendum-builder.jsx")), "addendum has no pricing config to open");
  assert.ok(read("../app/project/[accessId]/proposal-builder.jsx").includes("onOpenPricing={readOnly ? undefined : setPricingOpen}"), "Proposal still passes it");
});
