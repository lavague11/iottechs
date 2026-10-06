// Phase 2 (grid-first) — the enhanced aerial as a backdrop in the draw tool, so Building cells are
// painted ON the roof. Both widgets are single-file ES5; these are drift guards on the real source
// (same style as hybrid-workflow.test.mjs) — the live compositing is verified in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

test("survey hands the floor's aerial to the draw tool on iotPlanReady (ctx.src)", () => {
  assert.ok(survey.includes('type:"iotDrawBackdrop", fid:fid, src:(fl&&fl.ctx&&fl.ctx.src)||null'),
    "iotDrawBackdrop posted with the floor's ctx.src");
  // posted from inside the iotPlanReady branch (right after iotPlanLoad)
  const i = survey.indexOf('m.type==="iotPlanReady"');
  const j = survey.indexOf("iotDrawBackdrop");
  assert.ok(i >= 0 && j > i, "backdrop is sent within the iotPlanReady reply");
});

test("draw tool receives the backdrop and loads it as an image", () => {
  assert.ok(draw.includes('m.type!=="iotDrawBackdrop"'), "listens for iotDrawBackdrop");
  assert.ok(draw.includes("_bdImg=img"), "loads the aerial into the backdrop image");
  assert.ok(draw.includes("m.fid!==FID"), "matched to this floor id");
});

test("backdrop draws BEHIND the cells (after clearRect, before drawStructure) via the seed transform", () => {
  assert.ok(/clearRect\(0,0,W\(\),H\(\)\);\s*drawBackdrop\(\);\s*drawZoneCells\(\);\s*drawStructure\(\)/.test(draw.replace(/\n/g, " ")),
    "redraw order: clear -> backdrop -> zone cells -> structure");
  assert.ok(draw.includes("ctx.drawImage(_bdImg, +_seed.offx||0, +_seed.offy||0, a*sc, sc)"),
    "positioned through the same seed transform ctxVB uses (full aerial fraction -> canvas px)");
});

test("aerial toggle cycles Off -> Light -> Full with matching opacity", () => {
  assert.ok(draw.includes("_bdMode=(_bdMode+1)%3"), "button cycles 0->1->2");
  assert.ok(draw.includes("_bdMode===2?0.82:(_bdMode===1?0.45:0)"), "alpha: off 0, light .45, full .82");
  assert.ok(draw.includes('id="tAerial"'), "the Aerial toolbar button exists");
});
