import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { metersPerPixel, pxToFeet, cellsToSqFt } from "../lib/floor-scale.js";

const __dir = dirname(fileURLToPath(import.meta.url));

test("metersPerPixel from the trace handoff", () => {
  // 100 ft (30.48 m) spans 1.0 world unit, fit at 100 canvas px per unit → 1 px = 1 ft.
  const mpp = metersPerPixel(30.48, 100);
  assert.ok(Math.abs(mpp - 0.3048) < 1e-9);
  assert.ok(Math.abs(pxToFeet(1, mpp) - 1) < 1e-9);
  assert.ok(Math.abs(pxToFeet(26, mpp) - 26) < 1e-9);   // a 26px full box = 26 ft here
});

test("unknown scale resolves to 0, never a fake number", () => {
  assert.equal(metersPerPixel(0, 100), 0);
  assert.equal(metersPerPixel(30, 0), 0);
  assert.equal(pxToFeet(26, 0), 0);
  assert.equal(cellsToSqFt(4, 13, 0), 0);
});

test("room area in square feet", () => {
  // 1 px = 1 ft; a half-cell is 13 px = 13 ft; one full box = 4 half-cells = 26×26 ft = 676 sq ft.
  const mpp = 0.3048;
  assert.ok(Math.abs(cellsToSqFt(4, 13, mpp) - 676) < 1e-6);
});

// The draw widget is static HTML (no bundler) and inlines these conversions; guard against drift.
test("draw-floorplan widget inlines the canonical feet/area conversions", () => {
  const html = readFileSync(join(__dir, "..", "public", "widgets", "draw-floorplan.html"), "utf8");
  assert.ok(html.includes("M_PER_FT"), "widget must reference the M_PER_FT constant");
  assert.ok(html.includes("metersPerPx"), "widget must carry metersPerPx scale state");
});
