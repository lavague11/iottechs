import { test } from "node:test";
import assert from "node:assert/strict";
import { pctToPlanPx, polygonToCells, polygonsToZoneCells } from "../lib/zone-migrate.js";

// ctx viewBox: plate 0..100% maps to plan-px [0..200] in both axes (vw=vh=200, origin 0,0). HALF=13.
const VB = { x0: 0, y0: 0, vw: 200, vh: 200 };
const HALF = 13;

test("pctToPlanPx maps plate-% through the ctx viewBox", () => {
  assert.deepEqual(pctToPlanPx([[0, 0], [100, 100], [50, 25]], VB), [[0, 0], [200, 200], [100, 50]]);
  // non-zero origin offsets both axes
  assert.deepEqual(pctToPlanPx([[0, 0]], { x0: 10, y0: -5, vw: 200, vh: 200 }), [[10, -5]]);
});

test("polygonToCells: a plate-% square fills the covered cells, centre-inside", () => {
  // 0..50% square → plan-px 0..100 → cells c,r in 0..7 (centre c*13+6.5 < 100 → c<=7)
  const cells = polygonToCells([[0, 0], [50, 0], [50, 50], [0, 50]], VB, HALF);
  assert.ok(cells.length > 0);
  assert.ok(cells.includes("0,0") && cells.includes("3,3") && cells.includes("7,7"));
  assert.ok(!cells.includes("8,8"), "a cell whose centre is outside is excluded");
  cells.forEach((k) => { const [c, r] = k.split(",").map(Number); assert.ok(c >= 0 && c <= 7 && r >= 0 && r <= 7); });
});

test("polygonToCells: degenerate / missing inputs → []", () => {
  assert.deepEqual(polygonToCells([[0, 0], [1, 1]], VB, HALF), []);      // < 3 vertices
  assert.deepEqual(polygonToCells([[0, 0], [1, 0], [1, 1]], null, HALF), []); // no viewBox
  assert.deepEqual(polygonToCells([[0, 0], [1, 0], [1, 1]], { x0: 0, y0: 0, vw: 0, vh: 0 }, HALF), []);
});

test("polygonToCells: honours the cap", () => {
  const big = polygonToCells([[0, 0], [100, 0], [100, 100], [0, 100]], VB, HALF, 5);
  assert.equal(big.length, 5);
});

test("polygonsToZoneCells: boundary→site base, zones override, one class per cell", () => {
  const boundary = { pts: [[0, 0], [100, 0], [100, 100], [0, 100]] };          // whole plate → site
  const zones = [{ type: "driveway", pts: [[0, 0], [50, 0], [50, 50], [0, 50]] }]; // top-left quarter → driveway
  const zc = polygonsToZoneCells(boundary, zones, VB, HALF);
  assert.ok(zc.site && zc.driveway);
  const site = new Set(zc.site), dvy = new Set(zc.driveway);
  // no cell is in both classes (driveway won the overlap)
  let both = 0; dvy.forEach((k) => { if (site.has(k)) both++; });
  assert.equal(both, 0, "one class per cell — driveway overrides the site base");
  assert.ok(dvy.has("0,0"), "driveway claimed the overlapping corner");
  assert.ok(site.has("7,7") === false || !dvy.has("7,7")); // sanity: a far site cell isn't driveway
});

test("polygonsToZoneCells: no boundary, no zones → {}", () => {
  assert.deepEqual(polygonsToZoneCells(null, [], VB, HALF), {});
  assert.deepEqual(polygonsToZoneCells(null, null, VB, HALF), {});
});
