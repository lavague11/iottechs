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
  assert.ok(survey.includes("Create the Hybrid floor plan from the enhanced aerial"), "tooltip set");
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

test("Hybrid rule: inside the structure is a near-white planning canvas (outside stays full-colour aerial)", () => {
  // the transparent Hybrid plan layer fills the structure cells near-white so rooms/labels read; exterior has no fill → aerial shows
  assert.ok(draw.includes('<g fill="#ffffff" fill-opacity="0.95">'), "structure interior ~white in planLayerSVG");
  assert.ok(!draw.includes('<g fill="#ffffff" fill-opacity="0.85">'), "the old 0.85 see-through fill is gone");
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
