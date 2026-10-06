// #2/#4 acceptance: the aerial is NOT destructively cropped to the building — trCtx keeps the FULL leveled
// aerial (src) and emits a generous, aspect-padded viewport rect; the survey WINDOWS the full aerial to it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sat = readFileSync(new URL("../public/widgets/satellite-capture.html", import.meta.url), "utf8");
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

test("trCtx keeps the FULL aerial (not a building-bbox crop) and marks it full:true", () => {
  const fn = sat.slice(sat.indexOf("function trCtx()"), sat.indexOf("(function trInit()"));
  assert.ok(fn.includes("g.drawImage(capCanvas, 0,0, cv.width, cv.height)"), "src = the whole capCanvas (full aerial), not a sub-rect crop");
  assert.ok(fn.includes("full:true"), "ctx marks the new full-aerial semantics");
  assert.ok(/0\.35\*Math\.max/.test(fn), "generous ~35% margin (not a tight 20% hug)");
  assert.ok(fn.includes("ARlo=0.7, ARhi=1.5"), "viewport aspect is padded into a sane band — never a thin strip");
});

test("the survey windows the full aerial to the viewport rect (and only contains a legacy pre-cropped src)", () => {
  const fn = survey.slice(survey.indexOf("function renderView()"), survey.indexOf("function renderView()") + 1800);
  assert.ok(fn.includes("function layAerial(el,c)"), "layAerial windows the aerial");
  assert.ok(fn.includes("c.full && r && r.w>0 && r.h>0"), "windows when the src is the full aerial");
  assert.ok(fn.includes("backgroundSize=(100/r.w)"), "sub-rect fills the plate via background-size windowing");
  // #1: the plan layer must be transparent so the aerial shows through Hybrid (no opaque white occlusion)
  assert.ok(fn.includes('el.style.background="transparent"; el.style.backgroundImage'), "lay() uses a transparent layer bg so Hybrid shows the aerial");
});
