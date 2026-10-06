// Phase 1 (grid-first) — the floor's persisted grid transform + scale-derived grid box.
// Single-file ES5 widget → read the source, extract the pure helpers with a brace matcher, eval
// against stubbed globals (same pattern as boundary.test.mjs). Grid is canonical: feet per box +
// origin (plate fraction) + reserved rotation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start));
  let depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const FNS = ["validGrid", "niceStep", "floorScaleFeet", "gridBoxFtFor"].map((n) => extractFn(survey, n)).join("\n");
function env(curFloorScale = null) {
  const factory = new Function("curFloorScale", `var GRID_FULL=26; ${FNS}
    return { validGrid, niceStep, floorScaleFeet, gridBoxFtFor };`);
  return factory(curFloorScale);
}

test("validGrid: normalizes a good grid; rejects junk", () => {
  const e = env();
  const g = e.validGrid({ boxFt: 5, origin: { x: 0.2, y: -0.1 }, rotation: 12.345 });
  assert.deepEqual(g, { boxFt: 5, origin: { x: 0.2, y: -0.1 }, rotation: 12.35 });
  assert.equal(e.validGrid(null), null);
  assert.equal(e.validGrid({ boxFt: 0 }), null);
  assert.equal(e.validGrid({ boxFt: -3 }), null);
  assert.equal(e.validGrid({ boxFt: 1e9 }), null);
});

test("validGrid: origin clamped to [-1,1]; rotation wrapped to (-180,180]; defaults fill in", () => {
  const e = env();
  const g = e.validGrid({ boxFt: 10, origin: { x: 5, y: -9 }, rotation: 540 });
  assert.equal(g.origin.x, 1);
  assert.equal(g.origin.y, -1);
  assert.equal(g.rotation, 180);
  const d = e.validGrid({ boxFt: 10 });
  assert.deepEqual(d.origin, { x: 0, y: 0 });
  assert.equal(d.rotation, 0);
});

test("niceStep: ~10 boxes across, snapped to 1/2/5/10·10^n", () => {
  const e = env();
  assert.equal(e.niceStep(0), 0);
  assert.equal(e.niceStep(100), 10);  // raw 10
  assert.equal(e.niceStep(47), 5);    // raw 4.7 -> 5
  assert.equal(e.niceStep(250), 20);  // raw 25 -> 20
  assert.equal(e.niceStep(12), 1);    // raw 1.2 -> 1
});

test("floorScaleFeet: current scale wins, else ctx feet, else null", () => {
  assert.deepEqual(env({ ftW: 80, ftH: 60 }).floorScaleFeet({ scale: { ftW: 1, ftH: 1 } }), { ftW: 80, ftH: 60 });
  assert.deepEqual(env().floorScaleFeet({ scale: { ftW: 40, ftH: 30 } }), { ftW: 40, ftH: 30 });
  assert.deepEqual(env().floorScaleFeet({ ctx: { ftW: 120, ftH: 90 } }), { ftW: 120, ftH: 90 });
  assert.equal(env().floorScaleFeet({}), null);
});

test("gridBoxFtFor: explicit grid wins; else plan scale; else nice step; else 0", () => {
  const e = env();
  assert.equal(e.gridBoxFtFor({ grid: { boxFt: 7 }, plan: { metersPerPx: 0.05 } }), 7);          // explicit wins
  assert.ok(Math.abs(e.gridBoxFtFor({ plan: { metersPerPx: 0.05 } }) - (26 * 0.05 / 0.3048)) < 1e-9); // plan scale
  assert.equal(e.gridBoxFtFor({ scale: { ftW: 100, ftH: 80 } }), 10);                              // nice step from width
  assert.equal(e.gridBoxFtFor({}), 0);
});

test("renderGrid keeps the legacy plan-viewBox overlay for a hybrid floor with no explicit grid", () => {
  assert.ok(survey.includes("var useLegacy=(!f.grid && hybridCapable(f) && mpp>0)"), "legacy path gated on no explicit grid");
  assert.ok(survey.includes("canCanon=(!useLegacy && !!sc && boxFt>0)"), "canonical grid for a scaled aerial without the legacy overlay");
});

test("grid rides through restore, createFloor and duplicateFloor (deep copies)", () => {
  assert.ok(survey.includes("grid:validGrid(f.grid)"), "restore validates + carries grid");
  assert.ok(survey.includes("grid:(from&&from.grid)?JSON.parse(JSON.stringify(from.grid)):null"), "createFloor deep-copies grid");
  assert.ok(survey.includes("grid:src.grid?JSON.parse(JSON.stringify(src.grid)):null"), "duplicateFloor deep-copies grid");
});
