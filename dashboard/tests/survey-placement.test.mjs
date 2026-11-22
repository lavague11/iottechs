// Indoor / outdoor, DERIVED from where a device sits against the structure drawn on Layout
// (lib/survey-placement.js). Four cases the owner named: inside, outside, on the edge, no structure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLACEMENT, PLACEMENT_LABEL, HALF, cellKey, structureCells, floorHasDrawnStructure,
  placementOf, needsOutdoorRating, placementReviews,
  REVIEW_NO_STRUCTURE, REVIEW_ON_OUTLINE, REVIEW_NO_GEOMETRY,
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

test("cellKey maps a percent position onto the plan's half-cell grid", () => {
  assert.equal(cellKey(25.5, 40.5, VB), "25,40");
  assert.equal(cellKey(0, 0, VB), "0,0");
  assert.equal(cellKey(99.9, 99.9, VB), "99,99");
  assert.equal(cellKey(25, 40, null), null, "no viewbox → no cell, never a fabricated 0,0");
  assert.equal(cellKey("x", 40, VB), null);
});

test("INSIDE — a device on a structure cell", () => {
  const f = floorWith({ cells: BLOCK });
  assert.deepEqual(placementOf(at(21.5, 21.5), f, VB), { placement: PLACEMENT.INSIDE, reason: "" });
  assert.equal(needsOutdoorRating(PLACEMENT.INSIDE), false);
});

test("OUTSIDE — a device clear of the structure on every side", () => {
  const f = floorWith({ cells: BLOCK });
  // (60,60) is nowhere near the 20..22 block, and none of its eight neighbours are building.
  assert.deepEqual(placementOf(at(60.5, 60.5), f, VB), { placement: PLACEMENT.OUTSIDE, reason: "" });
  assert.equal(needsOutdoorRating(PLACEMENT.OUTSIDE), true, "an outdoor camera needs an outdoor-rated housing");
});

test("ON THE EDGE — the wall-mount band is flagged, never guessed", () => {
  const f = floorWith({ cells: BLOCK });
  // One cell off the footprint on each side, and on a diagonal corner: all touch the building.
  for (const [x, y] of [[23.5, 21.5], [19.5, 21.5], [21.5, 23.5], [21.5, 19.5], [23.5, 23.5], [19.5, 19.5]]) {
    const got = placementOf(at(x, y), f, VB);
    assert.equal(got.placement, PLACEMENT.REVIEW, `(${x},${y}) is on the outline`);
    assert.equal(got.reason, REVIEW_ON_OUTLINE);
  }
  // Two cells out is clear of the band and resolves normally — the flag is a one-cell band, not a halo.
  assert.equal(placementOf(at(24.5, 21.5), f, VB).placement, PLACEMENT.OUTSIDE);
  assert.equal(needsOutdoorRating(PLACEMENT.REVIEW), true,
    "an unanswered question about a camera that might be in the weather is not a reason to spec indoor");
});

test("NO STRUCTURE — nothing drawn means nothing to be inside or outside of", () => {
  // This is the case the old two-state rule got wrong: it called every device "outside", which is a
  // statement about a building, made without a building.
  for (const plan of [null, undefined, {}, { cells: [] }, { cells: [], rooms: [] }, { rooms: [{ cells: [] }] }]) {
    const got = placementOf(at(50, 50), floorWith(plan), VB);
    assert.equal(got.placement, PLACEMENT.REVIEW, `plan ${JSON.stringify(plan)} → review`);
    assert.equal(got.reason, REVIEW_NO_STRUCTURE);
  }
  assert.equal(floorHasDrawnStructure(floorWith({ cells: [] })), false);
  assert.equal(floorHasDrawnStructure(floorWith({ cells: BLOCK })), true);
});

test("a floor with structure but no plan geometry to measure against is also a review, not a guess", () => {
  assert.equal(placementOf(at(50, 50), floorWith({ cells: BLOCK }), null).reason, REVIEW_NO_GEOMETRY);
  assert.equal(placementOf({ k: "cam" }, floorWith({ cells: BLOCK }), VB).reason, REVIEW_NO_GEOMETRY,
    "a device with no coordinates cannot be placed");
});

test("rooms count as structure — a legacy plan can carry rooms without ever filling cells", () => {
  const f = floorWith({ rooms: [{ label: "Dining", cells: BLOCK }] });
  assert.equal(placementOf(at(21.5, 21.5), f, VB).placement, PLACEMENT.INSIDE);
  assert.equal(placementOf(at(60.5, 60.5), f, VB).placement, PLACEMENT.OUTSIDE);
  // Areas and zones are driveway / yard / parking — the outdoors — and must NOT count as building.
  const onlyAreas = floorWith({ cells: [], areas: [{ label: "Driveway", cells: BLOCK }], zoneCells: { parking: BLOCK } });
  assert.equal(placementOf(at(21.5, 21.5), onlyAreas, VB).reason, REVIEW_NO_STRUCTURE,
    "a floor with only outdoor areas has no structure drawn");
});

test("structureCells ignores junk keys rather than throwing on a corrupt plan", () => {
  const s = structureCells({ cells: ["1,2", "bad", 7, null, "3,4"], rooms: [{ cells: ["5,6"] }, null, { cells: "nope" }] });
  assert.deepEqual([...s].sort(), ["1,2", "3,4", "5,6"]);
});

test("placementReviews lists what a human still has to confirm, with the reason", () => {
  const f = floorWith({ cells: BLOCK }, [at(21.5, 21.5), at(23.5, 21.5), at(60.5, 60.5)]);
  const out = placementReviews(f, VB);
  assert.equal(out.length, 1, "only the wall-mount one needs confirming");
  assert.equal(out[0].cid, "c23.5_21.5");
  assert.equal(out[0].reason, REVIEW_ON_OUTLINE);
  assert.deepEqual(placementReviews(floorWith({ cells: BLOCK }, []), VB), [], "no devices, nothing to review");
});

test("the three labels are terse, and `review` is one of them — not a blank", () => {
  assert.deepEqual(PLACEMENT_LABEL, { inside: "Inside", outside: "Outside", review: "Review" });
});

test("the widget's placement rule never drifts from lib/survey-placement.js", () => {
  // The widget is static HTML and cannot import, so it mirrors the rule. If the two diverge, the
  // planner and everything reading the saved blob disagree about the same camera, with no error.
  assert.match(widget, /var SUG_HALF=13\b|SUG_HALF=13,/, `the widget's half-cell size still matches HALF=${HALF}`);
  const fn = widget.slice(widget.indexOf("function rmPlacement("), widget.indexOf("function rmDevCtx("));
  assert.ok(fn.includes('return "review"') && fn.includes('return "inside"') && fn.includes('return "outside"'),
    "the widget returns all three states");
  assert.ok(fn.indexOf("rmHasStructure") < fn.indexOf("rmStructHas(plan,key)"),
    "no-structure is tested FIRST — otherwise an empty plan falls through to the outline scan");
  assert.ok(/RM_N8/.test(fn), "the widget scans the same 8-neighbour band");
  assert.match(widget, /var RM_N8=\[\[1,0\],\[-1,0\],\[0,1\],\[0,-1\],\[1,1\],\[1,-1\],\[-1,1\],\[-1,-1\]\]/);
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
