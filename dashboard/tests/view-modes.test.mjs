// Phase 4.2 — Satellite | Plan | Hybrid view modes on one shared ctx plate.
// The widgets are single-file ES5 HTML with no exports; we read the real source, extract the
// one function whose math must not drift (ctxVB) and evaluate it, and otherwise pin the literals
// that wire the feature. If a widget drifts, these run the drifted code (or fail to find it).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../public/widgets/" + f, import.meta.url), "utf8");
const draw = read("draw-floorplan.html");
const survey = read("site-survey-merged.html");

// Full text of `function name(...){...}` (brace-matched, string/comment tolerant enough for these widgets).
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0, quote = null;
  assert.ok(i > 0, "no body for " + name);
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

test("4.2 draw: sketchSVG with no arg still computes the tight bbox + 6% margin", () => {
  const fn = extractFn(draw, "sketchSVG");
  assert.ok(fn.startsWith("function sketchSVG(vb)"), "sketchSVG now takes an optional viewBox override");
  assert.ok(fn.includes("if(vb)"), "vb override branch present");
  // The no-arg path keeps today's bbox computation (cellsBBoxPx + ~6% margin).
  assert.ok(fn.includes("cellsBBoxPx") && fn.includes("*0.06)"), "bbox + 6% margin still computed when no vb given");
});

test("4.2 draw: ctxVB math equals planLayerSVG's viewBox (shared helper) and matches the worked sample", () => {
  // planLayerSVG must call ctxVB() — one formula, so the plan layer and the ctx-framed bg can't drift.
  const pl = extractFn(draw, "planLayerSVG");
  assert.ok(pl.includes("ctxVB()"), "planLayerSVG builds its viewBox from ctxVB()");
  // Evaluate the real ctxVB against the worked sample from the task.
  const ctxVB = new Function("_seed", "CTX", extractFn(draw, "ctxVB") + "\nreturn ctxVB();");
  const vb = ctxVB({ sc: 400, offx: 20, offy: 30, aspect: 1.5 }, { x: 0.22, y: 0.22, w: 0.56, h: 0.56 });
  assert.deepEqual(vb, { x0: 152, y0: 118, vw: 336, vh: 224 });
  assert.equal(ctxVB(null, { x: 0, y: 0, w: 1, h: 1 }), null, "null without a seed");
});

test("4.2 draw: Done posts bgCtx:true on the ctx branch; the plain branch is unchanged (no bgCtx); enhanced raster unchanged", () => {
  assert.ok(draw.includes('dataUrl:sketchSVG(vb), vector:true, scale:scale, planSvg:planLayerSVG(), bgCtx:true'), "ctx-framed hand-off flags bgCtx:true");
  const plain = 'dataUrl:sketchSVG(), vector:true, scale:scale, planSvg:planLayerSVG()}';
  assert.ok(draw.includes(plain), "plain hand-drawn hand-off literal preserved for existing guards");
  assert.ok(!plain.includes("bgCtx"), "the plain hand-off carries no bgCtx");
  assert.ok(draw.includes('dataUrl:enhancedURL, scale:scale'), "AI-enhanced raster branch unchanged (no planSvg/bgCtx)");
});

test("4.2 survey: hybridCapable requires ctx.src AND planSvg AND bgCtx", () => {
  assert.ok(survey.includes("function hybridCapable(f){ return !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx); }"),
    "hybridCapable gates on all three — a 4.1-only floor (no bgCtx) is NON-capable");
});

test("4.2 survey: renderView composes Full / Layered / Plan on the shared two-layer stack", () => {
  const fn = extractFn(survey, "renderView");
  assert.ok(fn.includes('else if(v==="plan"){ aerial.style.display="none"; lay(img, bgData); }'), "PLAN → opaque ctx-framed bg, aerial hidden");
  assert.ok(fn.includes("layAerial(aerial, f.ctx); lay(img, f.planSvg)"), "Layered/Full → windowed full aerial + the transparent plan layer");
  assert.ok(fn.includes('if(v==="full") img.style.mixBlendMode="multiply"'), "FULL multiplies the plan layer → white interior drops, only geometry stays over the full-colour aerial");
  const nv = extractFn(survey, "normView");
  assert.ok(nv.includes('if(x==="full"||x==="satellite") return "full"') && nv.includes('return "layered"'), "legacy satellite→full, hybrid/default→layered");
  assert.ok(fn.includes('c.full && r && r.w>0 && r.h>0'), "layAerial windows the full aerial to the viewport rect");
  assert.ok(fn.includes('backgroundSize="cover"'), "non-capable keeps today's cover bg");
});

test("4.2 survey: #aerialImg is the first (behind) layer in #scene", () => {
  const i = survey.indexOf('id="aerialImg"'), j = survey.indexOf('id="stageImg"');
  assert.ok(i > 0 && j > 0 && i < j, "#aerialImg sits before #stageImg inside #scene");
  assert.ok(survey.includes('<div class="stage-img" id="aerialImg"></div>'), "aerial layer uses the .stage-img primitive");
});

test("4.2 survey: bgCtx and view carry through restore, createFloor, and duplicateFloor; cleared background drops bgCtx", () => {
  assert.ok(survey.includes("bgCtx:f.bgCtx||false,view:(typeof f.view===\"string\")?f.view:null"), "restore carries bgCtx + view");
  assert.ok(survey.includes("bgCtx:!!(from&&from.bgCtx), view:(wp&&typeof from.view===\"string\")?from.view:null"), "createFloor copies bgCtx always; view rides with the plan");
  assert.ok(survey.includes("bgCtx:!!src.bgCtx, view:(typeof src.view===\"string\")?src.view:null"), "duplicateFloor copies bgCtx + view");
  assert.ok(survey.includes("fl.bgCtx=false; }"), "clearCtx drops bgCtx (non-capable)");
  assert.ok(survey.includes('floors[curFloor].bgCtx=(pendingBgSource==="draw" && ev.data.bgCtx===true)'), "a draw result stores bgCtx only when flagged");
});

test("4.2 survey: the Full / Layered / Plan view SELECTOR is removed (view still composed by renderView)", () => {
  // The View drop-up was removed from the toolbar per owner request; the underlying view composition stays.
  assert.ok(!survey.includes('id="viewSel"') && !survey.includes('id="viewMenu"'), "the view selector + drop-up are gone");
  assert.ok(survey.includes("renderView()"), "renderView still composes the view stack");
  assert.ok(!survey.includes('data-v="satellite"') && !survey.includes('>Hybrid<'), "the old Aerial/Hybrid 3-button segmented is gone");
});

test("a ctx-framed (bgCtx) draw result uses the context-crop feet as the floor scale, not planFeet", () => {
  // The plate spans the ctx extent, so coverage (pxPerFt) must scale by ctx.ftW/ftH, not the draw tool's tight bbox+6%.
  assert.ok(survey.includes("fc.bgCtx && fc.ctx && +fc.ctx.ftW>0 && +fc.ctx.ftH>0"), "ctx-feet override guard present");
  assert.ok(/applyBackground\(ev\.data\.dataUrl, false, ev\.data\.vector, bgScale, ev\.data\.aerial\)/.test(survey), "applyBackground uses the resolved bgScale");
});

test("the top-left Fit/Focus zoom button is removed; app focus stays on fullBtn", () => {
  // The owner removed the top-left Fit button (focusBtn, a widget-internal zoom-to-plate). App-level focus
  // mode lives on the bottom-right Focus control (fullBtn), which asks the host to go full-screen.
  assert.ok(!survey.includes('id="focusBtn"') && !survey.includes('id="focusBtnTxt"'), "the Fit/Focus zoom button is gone");
  assert.ok(survey.includes('id="fullBtn"') && survey.includes("iotSurveyReqFocus"), "the bottom-right Focus still requests app-level focus mode");
  const fv = extractFn(survey, "focusView");
  assert.ok(!fv.includes("ctx.rect") && !fv.includes("f.plan"), "focusView (kept) still touches only pan/zoom — never the geometry/crop");
});
