// Indoor / outdoor, DERIVED from where a device sits against the structure drawn on Layout
// (lib/survey-placement.js). TWO states: inside the structure is indoor, anything else is outdoor —
// the wall-mount band, exactly on the outline, and a floor with no structure drawn all read outdoor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLACEMENT, PLACEMENT_LABEL, HALF, cellKey, structureCells, floorHasDrawnStructure,
  placementOf, needsOutdoorRating,
} from "../lib/survey-placement.js";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

// A viewbox where one percent == one half-cell, so a device at (25.5, 40.5) lands in cell "25,40"
// and the geometry in these tests is readable rather than arithmetic.
const VB = { x0: 0, y0: 0, vw: 100 * HALF, vh: 100 * HALF };
const at = (x, y) => ({ k: "cam", cid: `c${x}_${y}`, x, y });
// A 3×3 block of building from (20,20) to (22,22).
const BLOCK = [];
for (let c = 20; c <= 22; c++) for (let r = 20; r <= 22; r++) BLOCK.push(`${c},${r}`);
const floorWith = (plan, devices = []) => ({ plan, devices });

test("there are exactly two states", () => {
  assert.deepEqual(PLACEMENT, { INSIDE: "inside", OUTSIDE: "outside" });
  assert.deepEqual(PLACEMENT_LABEL, { inside: "Inside", outside: "Outside" });
});

test("cellKey maps a percent position onto the plan's half-cell grid", () => {
  assert.equal(cellKey(25.5, 40.5, VB), "25,40");
  assert.equal(cellKey(0, 0, VB), "0,0");
  assert.equal(cellKey(99.9, 99.9, VB), "99,99");
  assert.equal(cellKey(25, 40, null), null, "no viewbox → no cell, never a fabricated 0,0");
  assert.equal(cellKey("x", 40, VB), null);
});

test("INSIDE — a device on a structure cell is indoor", () => {
  const f = floorWith({ cells: BLOCK });
  assert.equal(placementOf(at(21.5, 21.5), f, VB), PLACEMENT.INSIDE);
  assert.equal(needsOutdoorRating(PLACEMENT.INSIDE), false, "an indoor camera needs no outdoor rating");
});

test("OUTSIDE — a device clear of the structure is outdoor", () => {
  const f = floorWith({ cells: BLOCK });
  assert.equal(placementOf(at(60.5, 60.5), f, VB), PLACEMENT.OUTSIDE);
  assert.equal(needsOutdoorRating(PLACEMENT.OUTSIDE), true);
});

test("ON THE EDGE — the wall-mount band and the outline itself are outdoor", () => {
  const f = floorWith({ cells: BLOCK });
  // One cell off the footprint on each side, and on a diagonal corner.
  for (const [x, y] of [[23.5, 21.5], [19.5, 21.5], [21.5, 23.5], [21.5, 19.5], [23.5, 23.5], [19.5, 19.5]]) {
    assert.equal(placementOf(at(x, y), f, VB), PLACEMENT.OUTSIDE, `(${x},${y}) is off the footprint → outdoor`);
  }
  // The boundary cell of the structure is still structure, so the very edge of the building is indoor.
  assert.equal(placementOf(at(20.1, 20.1), f, VB), PLACEMENT.INSIDE, "a corner cell of the building is inside it");
  assert.equal(placementOf(at(22.9, 22.9), f, VB), PLACEMENT.INSIDE);
});

test("NO STRUCTURE — a floor with nothing drawn is outdoor", () => {
  for (const plan of [null, undefined, {}, { cells: [] }, { cells: [], rooms: [] }, { rooms: [{ cells: [] }] }]) {
    assert.equal(placementOf(at(50, 50), floorWith(plan), VB), PLACEMENT.OUTSIDE, `plan ${JSON.stringify(plan)} → outdoor`);
  }
  assert.equal(floorHasDrawnStructure(floorWith({ cells: [] })), false);
  assert.equal(floorHasDrawnStructure(floorWith({ cells: BLOCK })), true);
});

test("nothing to measure against is outdoor too — the safe direction, not a coin flip", () => {
  // An outdoor-rated housing works indoors; an indoor one in the weather does not. So where the
  // geometry cannot prove a device is inside the building, outdoor over-specs rather than under-specs.
  assert.equal(placementOf(at(50, 50), floorWith({ cells: BLOCK }), null), PLACEMENT.OUTSIDE);
  assert.equal(placementOf({ k: "cam" }, floorWith({ cells: BLOCK }), VB), PLACEMENT.OUTSIDE);
});

test("rooms count as structure — a legacy plan can carry rooms without ever filling cells", () => {
  const f = floorWith({ rooms: [{ label: "Dining", cells: BLOCK }] });
  assert.equal(placementOf(at(21.5, 21.5), f, VB), PLACEMENT.INSIDE);
  assert.equal(placementOf(at(60.5, 60.5), f, VB), PLACEMENT.OUTSIDE);
  // Areas and zones are driveway / yard / parking — the outdoors — and must NOT count as building.
  const onlyAreas = floorWith({ cells: [], areas: [{ label: "Driveway", cells: BLOCK }], zoneCells: { parking: BLOCK } });
  assert.equal(placementOf(at(21.5, 21.5), onlyAreas, VB), PLACEMENT.OUTSIDE,
    "a floor with only outdoor areas has no structure drawn");
});

test("structureCells ignores junk keys rather than throwing on a corrupt plan", () => {
  const s = structureCells({ cells: ["1,2", "bad", 7, null, "3,4"], rooms: [{ cells: ["5,6"] }, null, { cells: "nope" }] });
  assert.deepEqual([...s].sort(), ["1,2", "3,4", "5,6"]);
});

test("the widget's placement rule never drifts from lib/survey-placement.js", () => {
  // The widget is static HTML and cannot import, so it mirrors the rule. If the two diverge, the
  // planner and everything reading the saved blob disagree about the same camera, with no error.
  assert.match(widget, /var SUG_HALF=13\b|SUG_HALF=13,/, `the widget's half-cell size still matches HALF=${HALF}`);
  const fn = widget.slice(widget.indexOf("function rmPlacement("), widget.indexOf("function rmDevCtx("));
  assert.ok(fn.includes('"inside"') && fn.includes('"outside"'), "the widget returns both states");
  assert.ok(!/review/i.test(fn), "and no third state");
  assert.match(widget, /function rmPlacement\(plan,key\)\{ return rmStructHas\(plan,key\) \? "inside" : "outside"; \}/,
    "the widget rule is the same single sentence as placementOf");
  // Structure = painted cells ∪ room cells, in the widget too.
  const has = widget.slice(widget.indexOf("function rmStructHas("), widget.indexOf("function rmPlacement("));
  assert.ok(has.includes("plan.cells") && has.includes("plan.rooms"), "cells AND rooms count as structure");
  assert.ok(!/areas|zoneCells/.test(has), "areas and zones are the outdoors and never count as building");
});

test("placement is NOT part of the approval fingerprint — recomputing it cannot void a signature", () => {
  // survey2Meaning hashes k/x/y/aim/fov/range/name only. This is what makes it safe to change the rule
  // under existing, already-approved surveys.
  const td = readFileSync(new URL("../lib/tool-data.js", import.meta.url), "utf8");
  const meaning = td.slice(td.indexOf("function survey2Meaning"), td.indexOf("export function survey2HasData"));
  assert.ok(!/placement/i.test(meaning), "survey2Meaning does not read placement");
  assert.match(meaning, /devices: \(f\?\.devices \|\| \[\]\)\.map\(v => \(\{ k: v\.k, x: [^}]*n: v\.name \|\| "" \}\)\)/,
    "the hashed device fields are still exactly k/x/y/aim/fov/range/name");
});
