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

test("backdrop draws BEHIND the areas (after clearRect, before drawStructure) via the seed transform", () => {
  // redraw clears in identity, applies the fit-to-fill view transform, THEN paints backdrop -> areas -> structure.
  assert.ok(/clearRect\(0,0,W\(\),H\(\)\);.*drawBackdrop\(\);\s*drawAreas\(\);\s*drawStructure\(\)/.test(draw.replace(/\n/g, " ")),
    "redraw order: clear -> backdrop -> areas -> structure");
  assert.ok(draw.includes("ctx.drawImage(_bdImg, +_seed.offx||0, +_seed.offy||0, a*sc, sc)"),
    "positioned through the same seed transform ctxVB uses (full aerial fraction -> canvas px)");
});

test("fit-to-fill view transform: aerial floors scale to fill the frame; pointer + overlays map through it; export untouched", () => {
  // baseView derives one scale from the aerial plate box (contain) so the photo fills the canvas edge-to-edge;
  // computeView then composes the user zoom/pan on top of it (both feed the SAME _vk/_vx/_vy).
  assert.ok(draw.includes("function baseView()") && draw.includes("function computeView()"), "fit-to-fill base + the composed view computation");
  assert.ok(draw.includes("k=Math.min(W0/bw, H0/bh)"), "contain fit → fills the frame without cropping");
  assert.ok(draw.includes("if(_bdImg && _seed && +_seed.sc>0){"), "only aerial floors fill; hand-drawn stay vk=1");
  assert.ok(draw.includes("_vk=b.vk*_uz; _vx=b.vx*_uz+_utx; _vy=b.vy*_uz+_uty;"), "user zoom/pan composes onto the fit base");
  // redraw paints through the view; pointer input inverse-maps through it; DOM overlays map through it.
  assert.ok(draw.includes("ctx.setTransform(dpr*_vk,0,0,dpr*_vk, dpr*_vx, dpr*_vy)"), "redraw paints through the view transform");
  assert.ok(draw.includes("return {x:(e.clientX-r.left-_vx)/_vk, y:(e.clientY-r.top-_vy)/_vk}"), "rel() inverse-maps pointer input through the view");
  assert.ok(draw.includes("p={ x:p.x*_vk+_vx, y:p.y*_vk+_vy, w:p.w*_vk, h:p.h*_vk };"), "positionPop maps the world bbox through the view");
  // the view is purely visual — stored geometry still exports from world space (planOut/ctxVB never read _vk)
  const planOut = draw.slice(draw.indexOf("function planOut("), draw.indexOf("function planOut(") + 400);
  assert.ok(!/_vk|_vx|_vy/.test(planOut), "planOut never reads the view transform (export stays in world space)");
});

test("aerial toggle cycles Off -> Light -> Full; Full is true full colour, default Full", () => {
  assert.ok(draw.includes("_bdMode=(_bdMode+1)%3"), "button cycles 0->1->2");
  assert.ok(draw.includes("_bdMode===2?1:(_bdMode===1?0.5:0)"), "alpha: off 0, light .5, full 1 (opaque = full colour)");
  assert.ok(/var _bdImg=null, _bdMode=2;/.test(draw), "defaults to Full so the aerial reads in full colour while editing");
  assert.ok(draw.includes('id="tAerial"'), "the Aerial toolbar button exists");
});
