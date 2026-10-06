import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Build Floor Plan → the satellite's focused OUTLINE-ONLY mode. The survey hands THIS floor's aerial to the satellite
// as the capture (iotLoadCapture, outlineOnly:true) on the SAME floor — no derived floor. The satellite loads that
// image AS the capture, hides all the live-capture chrome, and auto-enters the trace editor so the user outlines
// immediately. The loaded capture WINS the race against the satellite's default geocode (the live map never shows
// through). The widgets are single-file ES5 HTML with no exports, so DOM/handler guards are source-reads; the pure
// logic (ft→meters) is replicated numerically.
const read = (f) => readFileSync(new URL("../public/widgets/" + f, import.meta.url), "utf8");
const survey = read("site-survey-merged.html");
const sat = read("satellite-capture.html");

/* ------------------------------ survey → satellite handoff (in place) ------------------------------ */
test("the Build Floor Plan handler posts iotLoadCapture{outlineOnly} with THIS floor's src/scale/aerial, load-then-post", () => {
  const start = survey.indexOf('getElementById("buildPlanBtn").addEventListener');
  const h = survey.slice(start, start + 1600);
  assert.ok(h.includes('var lcBg=(f&&((f.ctx&&f.ctx.src)||f.bg))||"";'), "the image is this floor's ctx.src || bg");
  assert.ok(h.includes('openBgTool(SAT_SRC+"&buildplan=1", "satellite");'), "opens the satellite via openBgTool in the distinct outline-only src");
  assert.ok(h.includes('type:"iotLoadCapture", outlineOnly:true'), "posts iotLoadCapture in outline-only mode");
  assert.ok(h.includes("src:lcBg"), "carries the aerial as src");
  assert.ok(h.includes("ftW:(f.scale&&f.scale.ftW)||0, ftH:(f.scale&&f.scale.ftH)||0"), "carries the real-world scale (ft)");
  assert.ok(h.includes("aerial:f.aerial||null"), "carries the leveled transform");
  assert.ok(h.includes('satFrame.addEventListener("load", function h(){ satFrame.removeEventListener("load",h); lcPost(); }); lcPost();'), "one-shot load listener THEN immediate post (same pattern as postAerialRestore)");
  // in place: no clone, no "· Hybrid"
  assert.ok(!/createFloor\(/.test(h), "never derives a floor");
  assert.ok(!h.includes("· Hybrid"), "never appends '· Hybrid'");
});

/* ------------------------------ satellite: iotLoadCapture handler ------------------------------ */
const satH = (() => { const i = sat.indexOf('m.type!=="iotLoadCapture"'); return sat.slice(i - 220, i + 480); })();

test("satellite — iotLoadCapture is guarded to the parent window and marks loaded SYNCHRONOUSLY (race win)", () => {
  assert.ok(satH.includes('if(!m||m.type!=="iotLoadCapture"||e.source!==window.parent) return;'), "ignores anything not from the parent (sender guard)");
  assert.ok(satH.includes("loadedCapture=true; applyLoadedCapture();"), "marks loaded synchronously BEFORE the async image load");
  assert.ok(satH.includes("if(!map){ pendingCapture=m; return; }"), "a capture that beats Maps is stashed as pendingCapture (applied in initMap)");
  assert.ok(satH.includes("loadCapture(m); });"), "otherwise applies it now");
});

const lc = (() => { const i = sat.indexOf("function loadCapture(m){"); return sat.slice(i, sat.indexOf("im.src=m.src;", i) + 20); })();
test("satellite — loadCapture sets capCanvas / capMetersW/H / capAerial from the message", () => {
  assert.ok(lc.includes("outlineOnly=!!m.outlineOnly; applyOutlineOnly();"), "mode comes from the message + toggles the body class");
  assert.ok(lc.includes('var im=new Image(); im.crossOrigin="anonymous";'), "loads m.src through a cross-origin Image");
  assert.ok(lc.includes('cv.getContext("2d").drawImage(im,0,0); capCanvas=cv;'), "draws the image at natural size → capCanvas");
  assert.ok(lc.includes("capMetersW=(+m.ftW>0)?+m.ftW/3.28084:0; capMetersH=(+m.ftH>0)?+m.ftH/3.28084:0;"), "ftW/ftH → meters (0 when absent)");
  assert.ok(lc.includes('capAerial=(m.aerial&&typeof m.aerial==="object")?{ rotationDeg:+m.aerial.rotationDeg||0, northDeg:(Number.isFinite(+m.aerial.northDeg)?+m.aerial.northDeg:0), center:m.aerial.center||null, zoom:+m.aerial.zoom||0, rect:m.aerial.rect||null, stage:m.aerial.stage||null, mppView:+m.aerial.mppView||0 }:null;'), "capAerial mapped field-for-field (or null)");
});

test("satellite — the handler shows the captured preview like a finished capture AND auto-enters trace in outline-only", () => {
  assert.ok(lc.includes('$("prevImg").src=m.src; capturedCurrent=true; enhancedOnce=true; loadedCapture=true; resetCompare(); closeRev();'), "preview image + flags set like a finished capture");
  assert.ok(lc.includes('preview.classList.add("show");'), "lands on the captured preview");
  assert.ok(lc.includes("if(outlineOnly) enterTrace();"), "outline-only → auto-enters the trace editor (the user outlines immediately)");
  assert.ok(lc.includes("im.onerror=function(){ loadedCapture=false; outlineOnly=false; applyLoadedCapture(); applyOutlineOnly(); msg(\"\"); };"), "image error → fall back to the live map, don't strand");
});

/* ------------------------------ the loaded capture WINS the race ------------------------------ */
test("satellite — a pending capture wins over the default geocode in initMap (search never runs over it)", () => {
  assert.ok(sat.includes("if(pendingCapture){ var pc=pendingCapture; pendingCapture=null; loadCapture(pc); }"), "initMap applies a pending capture FIRST, skipping the default search");
  const tail = sat.slice(sat.indexOf("if(pendingCapture){"), sat.indexOf("if(pendingCapture){") + 560);
  assert.ok(tail.includes("else if(pendingAerial)"), "the pending-aerial restore is the next fallback");
  assert.ok(tail.includes("else search("), "a plain load still runs the default search");
  assert.ok(/pendingCapture.*pendingAerial.*search\(/s.test(tail), "capture > aerial > default order");
});

test("satellite — a loaded capture also blocks the initial recenter + the invalidate-on-zoom (preview.show sticks)", () => {
  assert.ok(sat.includes("if(!(isInitial && (aerialApplied || loadedCapture))){ map.setCenter(loc); map.setZoom(20); }"), "the initial geocode never recenters over a loaded capture");
  assert.ok(sat.includes("function invalidateCapture(){ if(loadedCapture) return;"), "invalidateCapture is a no-op for a loaded capture (a stray zoom_changed can't drop it)");
});

/* ------------------------------ outline-only mode hides the full chrome ------------------------------ */
test("satellite — outline-only hides the full-capture chrome (address/search + Level/Crop/Enhance/Download/Outline/Done)", () => {
  assert.ok(sat.includes("body.outline-only .head,body.outline-only .tbar{display:none!important}"), "address/search bar + the whole floating toolbar hidden in outline-only");
  // the mode is entered up front (URL param) so the chrome is hidden before the image even arrives
  assert.ok(sat.includes('var outlineOnly=(new URLSearchParams(location.search).get("buildplan")==="1");'), "outline-only is set from the buildplan src");
  assert.ok(sat.includes('if(outlineOnly) document.body.classList.add("outline-only");'), "hides chrome immediately on load");
  // the trace editor + its controls stay (shown by #preview.tracing)
  assert.ok(sat.includes("#preview.tracing #traceBar{display:flex}"), "the trace editor bar (Undo/Redo/Cancel/Redraw/Use Outline) stays");
  assert.ok(sat.includes("#preview.tracing #traceHint{display:block}"), "the outline hint stays");
});

test("satellite — the outline hint tells the user to outline the working area (Define Project Base)", () => {
  assert.ok(sat.includes("Outline the working area (property / lot), then Use Outline"), "project-base outline hint present");
});

test("satellite — Cancel in outline-only abandons back to the floor (posts iotCaptureCancel), survey closes the tool", () => {
  assert.ok(sat.includes('if(outlineOnly){ outlineOnly=false; applyOutlineOnly(); exitTrace(); try{ parent.postMessage({type:"iotCaptureCancel"},"*"); }catch(e){} return; }'), "outline-only Cancel posts iotCaptureCancel + leaves trace");
  assert.ok(survey.includes('ev.data.type!=="iotCaptureCancel"') && survey.includes("exitBg(false); });"), "the survey closes the tool on iotCaptureCancel");
});

/* ------------------------------ ft→meters conversion (replicated) ------------------------------ */
const metersFromFt = (ft) => (+ft > 0 ? +ft / 3.28084 : 0);
test("satellite — ft→meters conversion matches capMetersW/H", () => {
  assert.ok(Math.abs(metersFromFt(120) - 36.576) < 1e-3, "120 ft ≈ 36.576 m");
  assert.equal(metersFromFt(0), 0, "absent/zero ft → 0 meters");
  assert.equal(metersFromFt(undefined), 0, "undefined ft → 0 meters");
});

/* ------------------------------ Level/Crop hidden in loaded mode (unchanged) ------------------------------ */
test("satellite — Level/Crop are hidden in loaded-capture mode and return on a live capture / backToLive", () => {
  assert.ok(sat.includes('function applyLoadedCapture(){ var d=loadedCapture?"none":""; if($("tLevel")) $("tLevel").style.display=d; if($("tCrop")) $("tCrop").style.display=d; }'), "applyLoadedCapture hides/shows Level + Crop");
  assert.ok(/var capturedCurrent=false, cropMode=false, loadedCapture=false;/.test(sat), "loadedCapture declared false by default");
  const cap = sat.slice(sat.indexOf("capCanvas=cut;"), sat.indexOf("capCanvas=cut;") + 240);
  assert.ok(cap.includes("loadedCapture=false; applyLoadedCapture();"), "a fresh live capture clears loaded mode");
  assert.ok(sat.includes("capturedCurrent=false; loadedCapture=false; applyLoadedCapture();"), "backToLive clears loaded mode");
});

/* ------------------------------ trCtx unchanged — reads capCanvas ------------------------------ */
test("trCtx is unchanged — it still derives from capCanvas + capMetersW/H + capAerial", () => {
  const i = sat.indexOf("function trCtx(){");
  assert.ok(i > 0, "trCtx present");
  const body = sat.slice(i, sat.indexOf("function ", i + 10));
  assert.ok(body.includes("if(!capCanvas||tracePts.length<3) return null;"), "guards on capCanvas (the loaded aerial) + a closed outline");
  assert.ok(body.includes("var W=capCanvas.width, H=capCanvas.height"), "reads capCanvas dimensions");
  assert.ok(body.includes("if(capMetersW>0&&capMetersH>0)"), "uses capMetersW/H for the real-world footprint size");
  assert.ok(body.includes("northDeg: capAerial ? capAerial.northDeg : null"), "uses capAerial for north");
});
