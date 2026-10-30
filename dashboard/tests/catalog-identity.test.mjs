// Phase 1 — canonical catalog identity + Equipment/Labor classification.
// Contract: /dev/docs/pricing-fulfillment-architecture. Invariants: catalog id = canonical identity;
// proposal-line id = instance; line values are snapshots; type is stored not inferred from the live name;
// a service may hold mixed equipment/labor; catalog edits never rewrite existing lines.
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROPOSAL_CATALOG, catalogSlug, catalogItemById, catalogItemByName, catalogIdForName,
  itemTypeOf, catalogStampFor, normalizeProposalProvenance, makeCameraBundle, itemTotal, withCatalogIds,
} from "../lib/proposal.js";

const allItems = Object.entries(PROPOSAL_CATALOG).flatMap(([svc, list]) => (list || []).map((c) => ({ ...c, svc })));

test("every catalog item has a stable, unique id and a valid type", () => {
  const ids = new Set();
  for (const c of allItems) {
    assert.ok(c.id && typeof c.id === "string", `missing id for ${c.svc}/${c.name}`);
    assert.ok(!ids.has(c.id), `duplicate catalog id: ${c.id}`);
    ids.add(c.id);
    assert.ok(c.type === "equipment" || c.type === "labor", `bad type for ${c.id}: ${c.type}`);
  }
  assert.ok(ids.size === allItems.length);
});

test("id is derived from the ANCHOR name, service-scoped, and survives a DISPLAY rename / price edit", () => {
  // catalogSlug is deterministic; the id is "<service>:<slug>". The price book only changes the display
  // name/price, never this const — so the id is stable across renames and price edits.
  assert.equal(catalogIdForName("Camera", "camera"), "camera:camera");
  assert.equal(catalogIdForName("Cat6 Drop", "camera"), "camera:cat6_drop");
  assert.equal(catalogSlug("Camera Setup & Programming"), "camera_setup_programming");
  // A caller that renamed the DISPLAY to "Camera Setup & Programming" still resolves the SAME item by its
  // stored catalogItemId — identity is the id, not the shown text.
  const line = { name: "Camera Setup & Programming", baseName: "Camera Programming", price: 20, catalogItemId: "camera:camera_programming", itemType: "labor" };
  assert.equal(itemTypeOf(line, "camera"), "labor");
  assert.equal(catalogItemById(line.catalogItemId).name, "Camera Programming");
});

test("known standard items classify correctly (equipment vs labor)", () => {
  const eq = (n) => assert.equal(catalogItemByName(n, "camera")?.type, "equipment", `${n} should be equipment`);
  const lab = (n) => assert.equal(catalogItemByName(n, "camera")?.type, "labor", `${n} should be labor`);
  ["Camera", "NVR (16-Channel)", "NVR (8-Channel)", "8TB Storage Drive", "4TB Storage Drive", "Monitor + Mount"].forEach(eq);
  ["Cat6 Drop", "Cat6 Termination", "Camera Mounting", "Camera Programming", "Camera Waterproofing"].forEach(lab);
  // Toast + wiring spot checks
  assert.equal(catalogItemByName("Access Point", "toast").type, "equipment");
  assert.equal(catalogItemByName("Line Drop", "toast").type, "labor");
  assert.equal(catalogItemByName("Patch Panel", "wiring").type, "equipment");
  assert.equal(catalogItemByName("Conduit Run (per ft)", "wiring").type, "labor");
});

test("a NEW line built from the catalog carries the snapshot (catalogItemId + itemType)", () => {
  const block = makeCameraBundle({}, "Camera 1");
  const cam = block.sub.find((x) => x.baseName === "Camera");
  const drop = block.sub.find((x) => x.baseName === "Cat6 Drop");
  assert.equal(cam.catalogItemId, "camera:camera");
  assert.equal(cam.itemType, "equipment");
  assert.equal(drop.catalogItemId, "camera:cat6_drop");
  assert.equal(drop.itemType, "labor");
  // The container bundle header is NOT a catalog item — no stamp.
  assert.equal(block.catalogItemId, undefined);
});

test("SNAPSHOT: a line's stored price/name is independent of the current catalog default", () => {
  // Line was quoted at $25; the catalog default for that item is $20 today. The line keeps $25.
  const line = { name: "Camera Mounting", price: 25, catalogItemId: "camera:camera_mounting", itemType: "labor" };
  assert.equal(catalogItemByName("Camera Mounting", "camera").price, 20);   // current default
  assert.equal(line.price, 25);                                             // snapshot unchanged
  assert.equal(itemTypeOf(line, "camera"), "labor");
});

test("a service may contain MIXED equipment + labor children; each resolves independently", () => {
  const block = makeCameraBundle({}, "Camera 1");
  const types = block.sub.map((x) => itemTypeOf(x, "camera"));
  assert.ok(types.includes("equipment") && types.includes("labor"));
});

test("itemTypeOf: stored wins → id → name → null for a custom line", () => {
  assert.equal(itemTypeOf({ itemType: "equipment", name: "Whatever" }), "equipment");       // stored wins
  assert.equal(itemTypeOf({ catalogItemId: "camera:cat6_drop", name: "X" }), "labor");       // by id
  assert.equal(itemTypeOf({ name: "Camera Waterproofing" }, "camera"), "labor");             // by name
  assert.equal(itemTypeOf({ name: "Totally Custom Thing", price: 99 }), null);               // custom → null
  assert.deepEqual(catalogStampFor("Totally Custom Thing", "camera"), {});                    // no stamp
});

test("P1 hardening: catalog ids are EXPLICIT authored literals, not generated from any name", () => {
  // F: every item declares an explicit id (the loader throws otherwise — proven below).
  for (const c of allItems) assert.ok(typeof c.id === "string" && c.id.length > 0, `${c.svc}/${c.name} has no id`);
  // Preservation: the exact ids P1 first shipped are retained (no migration churn).
  assert.equal(catalogItemByName("Cat6 Drop", "camera").id, "camera:cat6_drop");
  assert.equal(catalogItemByName("NVR (16-Channel)", "camera").id, "camera:nvr_16_channel");
  assert.equal(catalogItemByName("Rack & Mount", "sound").id, "sound:rack_mount");
  assert.equal(catalogItemByName("Line Drop", "toast").id, "toast:line_drop");
  assert.equal(catalogItemByName("Maglock", "access").id, "access:maglock");
  // Same display name under two services → DISTINCT explicit ids (identity is authored per item, not a
  // global slug of the name).
  assert.notEqual(catalogItemByName("Cat6 Drop", "camera").id, catalogItemByName("Cat6 Drop", "wiring").id);
  assert.equal(catalogItemByName("Cat6 Drop", "wiring").id, "wiring:cat6_drop");
});

test("P1 hardening: id is independent of name/price/cost/order (A–E) and resolves by id alone", () => {
  // The id is a separate field; a (hypothetical) rename or reprice of a line can't change it. itemTypeOf /
  // catalogItemById key off the id, never the live text.
  const base = catalogItemById("camera:cat6_drop");
  const renamed = { ...base, name: "Structured Cabling Run", price: 999, cost: 50 };
  assert.equal(renamed.id, "camera:cat6_drop");                 // A/C/D: id unchanged after rename/price/cost
  assert.equal(catalogItemById(renamed.id).name, "Cat6 Drop");  // id still points at the canonical item
  // E: reorder the raw definitions → same id set, same count.
  const shuffled = withCatalogIds({ camera: [...PROPOSAL_CATALOG.camera].reverse() });
  const a = PROPOSAL_CATALOG.camera.map((c) => c.id).sort();
  const b = shuffled.camera.map((c) => c.id).sort();
  assert.deepEqual(b, a);
});

test("P1 hardening: the loader REQUIRES an explicit id and rejects duplicates (H)", () => {
  assert.throws(() => withCatalogIds({ camera: [{ name: "No Id Item", price: 1, cost: 0, type: "labor" }] }), /missing an explicit id/);
  assert.throws(() => withCatalogIds({ camera: [{ id: "x:y", name: "A", price: 1, cost: 0 }, { id: "x:y", name: "B", price: 1, cost: 0 }] }), /duplicate catalog id/);
});

test("normalizeProposalProvenance is idempotent, additive, and never changes totals", () => {
  const payload = { options: [{ id: "A", services: [{ key: "camera", label: "Security Cameras", items: [
    { id: "L1", name: "NVR (16-Channel)", price: 300, qty: 1 },                               // legacy, no stamp
    { id: "L2", name: "Camera Install Complete", price: 0, qty: 1, sub: [                       // container + labor subs
      { id: "S1", name: "Camera", baseName: "Camera", price: 70, qty: 1 },
      { id: "S2", name: "Cat6 Drop", baseName: "Cat6 Drop", price: 150, qty: 1, waived: true },  // waived — total 0, preserved
    ] },
    { id: "L3", name: "Custom Widget", price: 42, qty: 1 },                                     // custom — stays unresolved
  ] }] }] };
  const before = payload.options[0].services[0].items.reduce((s, it) => s + itemTotal(it), 0);
  const norm = normalizeProposalProvenance(payload);
  const norm2 = normalizeProposalProvenance(norm);
  const items = norm.options[0].services[0].items;
  // stamped by name
  assert.equal(items[0].catalogItemId, "camera:nvr_16_channel");
  assert.equal(items[0].itemType, "equipment");
  assert.equal(items[1].sub[0].itemType, "equipment");  // Camera
  assert.equal(items[1].sub[1].itemType, "labor");       // Cat6 Drop
  // container header stays a container (unresolved name) and custom stays unresolved
  assert.equal(items[1].catalogItemId, undefined);
  assert.equal(items[2].catalogItemId, undefined);
  // additive: price/qty/waiver unchanged, totals identical, idempotent
  assert.equal(items[0].price, 300);
  assert.equal(items[1].sub[1].price, 150);
  assert.equal(items[1].sub[1].waived, true);
  const after = items.reduce((s, it) => s + itemTotal(it), 0);
  assert.equal(after, before);
  assert.deepEqual(norm2, norm);
});
