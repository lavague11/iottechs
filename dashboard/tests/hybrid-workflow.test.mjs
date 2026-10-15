import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ONE consolidated "Create Floor Plan" path (replaces the old "Create Hybrid" derived-floor flow). On a floor that HAS
// an aerial but is NOT yet a plan, a single gold primary verb enters the Structure editor DIRECTLY on that same floor's
// aerial — no outline gate: the whole cropped image is the base (four image-corner bounds synthesized), over a full-frame
// ctx so there is no reframe/zoom-out (no derived "· Hybrid" floor, no createFloor). The rarer actions (Change background
// · Enhance aerial) live under a ••• overflow. The widget is static HTML (no imports), so the DOM/handler guards are
// source-reads; the gate predicate is replicated and proven numerically.
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const has = (s, msg) => assert.ok(survey.includes(s), msg || `missing: ${s}`);

test("Create Hybrid Floor Plan is the item in the bottom-right ••• drop-up (inline-SVG, gold icon, no emoji)", () => {
  has('<button id="buildPlanBtn"', "build button element");
  has("Create Hybrid Floor Plan", "primary workflow label (kept)");
  const i = survey.indexOf('<button id="buildPlanBtn"');
  const btn = survey.slice(i, survey.indexOf("</button>", i));
  assert.ok(btn.includes("<svg"), "icon is inline SVG");
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(btn), "no emoji in the label/icon");
  // it lives inside the ••• menu now (not a top-left gold button); its icon carries the gold accent
  assert.ok(survey.includes('<div id="bgMenu" role="menu"><button id="buildPlanBtn"'), "Create Hybrid Floor Plan is the ••• menu item");
  assert.ok(/#bgMenu #buildPlanBtn svg\{[^}]*color:var\(--gold\)/.test(survey), "the build item's icon carries the gold accent");
  // the OLD derived-floor entry is gone — no #hybridBtn, derived/"· Hybrid" floors, canCreateHybrid.
  assert.ok(!survey.includes('id="hybridBtn"'), "the old #hybridBtn element is gone");
  assert.ok(!survey.includes('" · Hybrid"') && !survey.includes("· Hybrid"), "no '· Hybrid' floor naming anywhere");
  assert.ok(!survey.includes("canCreateHybrid"), "the old canCreateHybrid gate is gone");
});

test("top-left = Edit background (direct); Create Hybrid lives in a bottom-right ••• drop-up", () => {
  // top-left: one direct button, no ••• here, no standalone Enhance (it lives in the Edit-background flow)
  has('<button id="changeBgBtn"', "Edit background is a direct button");
  has('aria-label="Edit background"', "Edit background is labelled (icon-only button, accessible name)");
  assert.ok(!survey.includes('id="enhBtn"'), "no standalone Enhance button");
  // bottom-right ••• drop-up
  has('<div id="planMore">', "bottom-right overflow container");
  assert.ok(/#planMore\{position:absolute;right:14px;bottom:14px/.test(survey), "••• sits in the bottom-right corner (the Show control was removed; Full screen is top-right)");
  has('<button id="bgMore"', "••• trigger present");
  has('aria-haspopup="true"', "••• declares a menu popup");
  has('#planMore.menu #bgMenu{display:flex}', "the drop-up opens from the ••• container");
  // the old Fit/Fill button is gone
  assert.ok(!survey.includes('id="fitBtn"'), "the Fit/Fill button is removed");
  // locked states hide both clusters
  has("body.ro #bgActions, body.frozen #bgActions{display:none!important}", "locked states hide the top-left actions");
  has("body.ro #planMore, body.frozen #planMore{display:none!important}", "locked states hide the ••• overflow");
});

test("gating: Build Floor Plan shows on an aerial floor that is NOT yet a plan, and not frozen", () => {
  has('function floorHasAerial(f){ return !!(f && (f.bgSource==="satellite" || f.aerial || (f.ctx && f.ctx.src)));', "floorHasAerial reads the floor record");
  has("function canBuild(f){ return !!(f && floorHasAerial(f) && !hybridCapable(f) && !frozen()); }", "canBuild composes floorHasAerial AND !hybridCapable AND !frozen");
  // updateBgActions drives visibility: the ••• More sheet is the home for Edit/Replace/Create (+ Mode/
  // Floor/Step), so it shows over ANY real background on every step; the Create-floor-plan ITEM gates on
  // canBuild. The old top-left "Edit background" button is retired (its action moved into the sheet).
  has('var pmShow=(bgHasImage && !frozen() && !bgToolOpen);', "the ••• shows over any real background, outside any tool, on every step");
  has('bp.style.display = canBuild(floors[curFloor]) ? "flex" : "none"', "Create floor plan shows only when canBuild");
  has('pm.style.display = pmShow ? "flex" : "none"', "the ••• (More sheet trigger) shows over any real background");
  // re-evaluated on step/floor change and on submit/unsubmit (frozen flips)
  has("updateBgActions();   // the floor actions", "goStep re-gates the floor actions");
  const setStatus = survey.slice(survey.indexOf("function setStatus("), survey.indexOf("function setStatus(") + 1100);
  assert.ok(setStatus.includes("updateBgActions()"), "setStatus re-gates on frozen change");
});

// replicate canBuild (frozen() assumed false) and prove the gate
const floorHasAerial = (f) => !!(f && (f.bgSource === "satellite" || f.aerial || (f.ctx && f.ctx.src)));
const hybridCapable = (f) => !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx);
const canBuild = (f) => !!(f && floorHasAerial(f) && !hybridCapable(f));
test("canBuild: an aerial-not-yet-plan floor qualifies; a plain or already-built floor does not", () => {
  assert.equal(canBuild({ bgSource: "satellite", name: "Floor 1" }), true, "aerial, no Structure → Build offered");
  assert.equal(canBuild({ aerial: { northDeg: 0 }, name: "Floor 1" }), true, "an inherited aerial transform also qualifies");
  assert.equal(canBuild({ ctx: { src: "x" }, planSvg: "y", bgCtx: true, name: "Floor 1" }), false, "already hybrid-capable → no Build (it's already a plan)");
  assert.equal(canBuild({ name: "Floor 1" }), false, "a non-aerial (plain upload) floor never qualifies");
});

test("Create Floor Plan goes STRAIGHT to the Structure editor IN PLACE — no outline gate: full-image base + full-frame ctx, no reframe", () => {
  const start = survey.indexOf('getElementById("buildPlanBtn").addEventListener');
  const h = survey.slice(start, start + 2600);
  assert.ok(h.includes("if(frozen()) return;"), "guards frozen");
  assert.ok(h.includes("if(!canBuild(f)) return;"), "guards the gate again at click time");
  assert.ok(h.includes("snapFloor();"), "snaps the floor's live edits onto its record before opening the tool");
  assert.ok(!/createFloor\(/.test(h), "NEVER derives/clones a floor — it builds on the current floor");
  assert.ok(!/renderFloorTabs\(\)/.test(h), "no new floor → no floor-tab re-render in the handler");
  assert.ok(h.includes('var lcBg=(f&&((f.ctx&&f.ctx.src)||f.bg))||""; if(!lcBg) return;'), "the image is this floor's ctx.src || bg");
  // the gate is gone: the PRIMARY path no longer opens the satellite outline-only mode — it enters the editor directly
  assert.ok(!h.includes('type:"iotLoadCapture", outlineOnly:true'), "the primary path does NOT force the outline-only satellite (gate removed)");
  assert.ok(h.includes("new Image()"), "measures the aerial to get its aspect for the full-image bounds");
  assert.ok(h.includes("rect:{x:0,y:0,w:1,h:1}, full:true"), "synthesizes a FULL-FRAME ctx (whole image, no bbox+margin crop → no reframe/zoom-out)");
  assert.ok(h.includes("enterDraw({ pts:[[0,0],[1,0],[1,1],[0,1]], aspect:ar, base:true, pad:0"), "hands off the four image-corner bounds as the base, pad:0 so the image fills the canvas");
  assert.ok(h.includes("f.ctx=cx;"), "stores the full-frame ctx on THIS floor before entering the editor");
  assert.ok(/uploadBackground\(f\.ctx\.src/.test(h), "mirrors the outline path's inline-blob → /api/media upload");
  // a measurement failure (never for a real data:/ /api/media aerial) falls back to the old outline tool so the feature is never dead
  assert.ok(h.includes("img.onerror=function(){ openOutlineFallback(f, lcBg); };"), "image-measure failure falls back to the outline tool");
  assert.ok(survey.includes("function openOutlineFallback(f, lcBg)"), "the outline tool survives as a guarded fallback (legacy + error path)");
});

test("Use Outline still routes to enterDraw on the CURRENT floor (in-place handoff, unchanged)", () => {
  // the satellite-capture-result handler: an outline result → set the floor's ctx + hand off to the Structure editor
  has("if(ol && ol.pts && ol.pts.length>=3){", "outline branch present");
  has("floors[curFloor].ctx=validCtx(ev.data.ctx)", "the outline sets THIS floor's ctx (same curFloor, no switch)");
  has("flushNow(); ol.base=true; enterDraw(ol); return;", "Use Outline flushes, marks the outline as the Project Base, then enters the editor in place");
});

test("Build Floor Plan → Change background delegate to the existing enterBg/enterDraw/postAerialRestore engine", () => {
  const cb = survey.slice(survey.indexOf('getElementById("changeBgBtn").addEventListener'), survey.indexOf('getElementById("changeBgBtn").addEventListener') + 450);
  assert.ok(cb.includes("if(curBgSource===\"draw\"){ enterDraw(); return; }"), "a drawn floor resumes the draw tool");
  assert.ok(cb.includes("if(curBgSource===\"satellite\"){ var was=bgToolSrc; if(hybridCapable(floors[curFloor])) pendingCtxSwap=true; enterBg(); postAerialRestore(bgToolSrc!==was); return; }"), "an aerial floor reopens the satellite as leveled (hybrid floor flags the src-only swap)");
  // Cancel from outline-only closes the tool back to the floor (no derived floor to discard)
  has('ev.data.type!=="iotCaptureCancel"', "the parent handles the outline-only Cancel");
  has("exitBg(false); });", "Cancel exits the tool without committing");
});

test("hybridCapable contract unchanged — a built Structure plan is a plan; aerial-only is not", () => {
  has("function hybridCapable(f){ return !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx); }", "hybridCapable contract unchanged");
  assert.equal(hybridCapable({ ctx: { src: "x" } }), false, "aerial-only (no Structure) is not hybrid-capable");
  assert.equal(hybridCapable({ ctx: { src: "x" }, planSvg: "y", bgCtx: true }), true, "a built Structure plan is hybrid-capable");
});
