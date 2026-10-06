import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ONE consolidated "Build Floor Plan" path (replaces the old "Create Hybrid" derived-floor flow). On a floor that HAS
// an aerial but is NOT yet a plan, a single gold primary verb — "Build Floor Plan" — opens the satellite in a focused
// outline-only mode on THAT SAME floor's aerial (no derived "· Hybrid" floor, no createFloor). The rarer actions
// (Change background · Enhance aerial) live under a ••• overflow. The widget is static HTML (no imports), so the
// DOM/handler guards are source-reads; the gate predicate is replicated and proven numerically.
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const has = (s, msg) => assert.ok(survey.includes(s), msg || `missing: ${s}`);

test("one primary action: Create Hybrid Floor Plan (gold primary, inline-SVG icon, the one deliberate longer label)", () => {
  has('<button id="buildPlanBtn"', "build button element");
  has("Create Hybrid Floor Plan", "primary workflow label");
  const i = survey.indexOf('<button id="buildPlanBtn"');
  const btn = survey.slice(i, survey.indexOf("</button>", i));
  assert.ok(btn.includes("<svg"), "icon is inline SVG");
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(btn), "no emoji in the label/icon");
  // gold-filled primary styling
  assert.ok(/#buildPlanBtn\{[^}]*background:var\(--gold\)/.test(survey), "Build Floor Plan is the gold primary");
  // the OLD derived-floor entry is gone — no #hybridBtn, derived/"· Hybrid" floors, canCreateHybrid.
  // ("Create Hybrid Floor Plan" is the NEW in-place primary label, verified above — not the old derived flow.)
  assert.ok(!survey.includes('id="hybridBtn"'), "the old #hybridBtn element is gone");
  assert.ok(!survey.includes('" · Hybrid"') && !survey.includes("· Hybrid"), "no '· Hybrid' floor naming anywhere");
  assert.ok(!survey.includes("canCreateHybrid"), "the old canCreateHybrid gate is gone");
});

test("the rarer actions are folded under a single ••• overflow (Change background · Enhance aerial)", () => {
  has('<button id="bgMore"', "overflow trigger present");
  has('aria-haspopup="true"', "••• declares a menu popup");
  has('<div id="bgMenu" role="menu">', "overflow menu present");
  has('<button id="changeBgBtn" role="menuitem"', "Change background is a menu item");
  has("Change background", "Change background label");
  has('<button id="enhBtn" role="menuitem"', "Enhance aerial is a menu item");
  has("Enhance aerial", "Enhance aerial label");
  // the whole cluster is locked out for read-only / submitted
  has("body.ro #bgActions, body.frozen #bgActions{display:none!important}", "locked states hide the floor actions");
});

test("gating: Build Floor Plan shows on an aerial floor that is NOT yet a plan, and not frozen", () => {
  has('function floorHasAerial(f){ return !!(f && (f.bgSource==="satellite" || f.aerial || (f.ctx && f.ctx.src)));', "floorHasAerial reads the floor record");
  has("function canBuild(f){ return !!(f && floorHasAerial(f) && !hybridCapable(f) && !frozen()); }", "canBuild composes floorHasAerial AND !hybridCapable AND !frozen");
  // updateBgActions drives visibility: cluster on the Background step over a real floor; Build only when canBuild
  has('var f=floors[curFloor], show=(curStep===0 && bgHasImage && !frozen() && !bgToolOpen);', "cluster shows on the Background tab over a real floor, outside any tool");
  has('bp.style.display = canBuild(f) ? "inline-flex" : "none"', "Build Floor Plan gates on canBuild(current floor)");
  has('ea.style.display = floorHasAerial(f) ? "flex" : "none"', "Enhance aerial shows only when there's an aerial");
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

test("Build Floor Plan builds IN PLACE: no createFloor, no derived floor, outline-only iotLoadCapture on the CURRENT floor", () => {
  const start = survey.indexOf('getElementById("buildPlanBtn").addEventListener');
  const h = survey.slice(start, start + 1600);
  assert.ok(h.includes("if(frozen()) return;"), "guards frozen");
  assert.ok(h.includes("if(!canBuild(f)) return;"), "guards the gate again at click time");
  assert.ok(h.includes("snapFloor();"), "snaps the floor's live edits onto its record before reopening the tool");
  assert.ok(!/createFloor\(/.test(h), "NEVER derives/clones a floor — it builds on the current floor");
  assert.ok(!/renderFloorTabs\(\)/.test(h), "no new floor → no floor-tab re-render in the handler");
  assert.ok(h.includes('openBgTool(SAT_SRC+"&buildplan=1", "satellite");'), "reuses openBgTool with a distinct outline-only src");
  assert.ok(h.includes('type:"iotLoadCapture", outlineOnly:true'), "posts iotLoadCapture in outline-only mode");
  assert.ok(h.includes('src:lcBg'), "hands THIS floor's aerial as the capture (outline it, no fresh live shot)");
  assert.ok(h.includes('var lcBg=(f&&((f.ctx&&f.ctx.src)||f.bg))||""; if(!lcBg) return;'), "the image is this floor's ctx.src || bg");
  assert.ok(h.includes("ftW:(f.scale&&f.scale.ftW)||0, ftH:(f.scale&&f.scale.ftH)||0"), "carries the floor's real-world scale (ft)");
  assert.ok(h.includes("aerial:f.aerial||null"), "carries the floor's leveled transform");
  assert.ok(h.includes('satFrame.addEventListener("load", function h(){ satFrame.removeEventListener("load",h); lcPost(); }); lcPost();'), "one-shot load listener THEN immediate post");
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
  assert.ok(cb.includes("if(curBgSource===\"satellite\"){ var was=bgToolSrc; enterBg(); postAerialRestore(bgToolSrc!==was); return; }"), "an aerial floor reopens the satellite as leveled");
  // Cancel from outline-only closes the tool back to the floor (no derived floor to discard)
  has('ev.data.type!=="iotCaptureCancel"', "the parent handles the outline-only Cancel");
  has("exitBg(false); });", "Cancel exits the tool without committing");
});

test("hybridCapable contract unchanged — a built Structure plan is a plan; aerial-only is not", () => {
  has("function hybridCapable(f){ return !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx); }", "hybridCapable contract unchanged");
  assert.equal(hybridCapable({ ctx: { src: "x" } }), false, "aerial-only (no Structure) is not hybrid-capable");
  assert.equal(hybridCapable({ ctx: { src: "x" }, planSvg: "y", bgCtx: true }), true, "a built Structure plan is hybrid-capable");
});
