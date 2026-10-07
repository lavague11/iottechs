// "Define Project Base": the outline step now draws the WORKING AREA, which sets the grid extent and
// seeds Site cells (not Building). Building is painted in Setup. Source guards across the 3 widgets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
const sat = readFileSync(new URL("../public/widgets/satellite-capture.html", import.meta.url), "utf8");

test("the primary action is 'Create Hybrid Floor Plan' (outline = the working area / project base)", () => {
  assert.ok(survey.includes("<span>Create Hybrid Floor Plan</span>"), "button labeled Create Hybrid Floor Plan");
  assert.ok(survey.includes('title="Outline the working area, set the grid, draw the structure"'), "tooltip set");
});

test("Use Outline marks the outline as the Project Base before handing off", () => {
  assert.ok(survey.includes("ol.base=true; enterDraw(ol);"), "outline flagged as base");
});

test("the draw tool seeds the base as SITE cells, leaving Building empty", () => {
  assert.ok(draw.includes("if(S.base){ zoneCells={ site:out }; cells=new Set(); rooms=[]; }"),
    "a base outline fills Site cells, not Building");
  // the non-base branch still seeds Building (legacy / any direct outline)
  assert.ok(draw.includes("else { cells=out; rooms=[]; }"), "non-base outline still seeds the structure");
});

test("the satellite hint asks for the working area, not the building", () => {
  assert.ok(sat.includes("Outline the working area (property / lot), then Use Outline"));
  assert.ok(!sat.includes("Tap each corner of the building"), "old building-outline hint removed");
});

test("Layered rule: inside the structure is a CLEAN opaque-white canvas (one coalesced shape, no seam-grid)", () => {
  // the Layered plan layer fills the structure as ONE coalesced opaque-white shape (structFill) so there is no
  // seam 'grid' from per-cell rects; exterior has no fill → aerial shows. In Full view it multiplies, so the aerial returns.
  assert.ok(draw.includes('var sf=structFill(0.4); if(sf) o.push(\'<g fill="#ffffff">\''), "Layered structure interior = one coalesced opaque-white shape (structFill, overlapping → no seams)");
  assert.ok(!draw.includes('<g fill="#ffffff" fill-opacity="0.95">') && !draw.includes('<g fill="#ffffff" fill-opacity="0.85">'), "the old per-cell translucent fill (seam-grid) is gone");
  assert.ok(draw.includes("function structFill(e)") && draw.includes("prev-start+1"), "structFill coalesces adjacent columns into runs");
});

test("device markers layer ABOVE the boundary/zone/grid, but don't block boundary editing", () => {
  assert.ok(/\.devNode\{[^}]*z-index:5/.test(survey), "devNode z-index 5 (above boundary z4 / zone z3 / grid z2)");
  assert.ok(survey.includes("body.regions .devNode{pointer-events:none}"), "markers are display-only while editing regions");
});

test("precision loupe on the project-base vertices (shared design with the camera loupe)", () => {
  assert.ok(sat.includes('#trLoupe{') && sat.includes("function trLoupeShow(") && sat.includes("function trLoupeHide("), "loupe element + show/hide exist");
  // magnifies the enhanced aerial (#prevImg) at the vertex image-fraction, centred crosshair
  assert.ok(sat.includes("lp.style.backgroundImage='url(\"'+src+'\"")  && sat.includes("L/2 - frac.x*Wd*Z"), "centres the aerial on the vertex fraction");
  assert.ok(sat.includes('class="lxh"'), "crosshair");
  // shown while grabbing / dragging a vertex; hidden on pan / pinch / release
  assert.ok(sat.includes("trLoupeShow(p, tracePts[hit])") && sat.includes("trLoupeShow(p, tracePts[trDrag])"), "loupe follows the vertex anchor on grab + drag");
  assert.ok(/function trEnd\(e\)\{[^]*?trLoupeHide\(\);/.test(sat), "hidden on release");
});
