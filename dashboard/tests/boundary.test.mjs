// Phase 5.1 — site BOUNDARY polygon + its editor (site-survey-merged.html).
// The widget is single-file ES5 HTML with no exports, so — like outline.test.mjs — we read the real source,
// extract the boundary helpers with a brace matcher and evaluate them against stubbed globals. If the widget
// drifts, these tests run the drifted code (or fail to find it). Plate-% space: a vertex is [x,y] in 0..100.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

// Return the full text of `function name(...){...}` (brace-matched, string/comment tolerant enough for this widget).
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start));
  assert.ok(i > 0, "no body for " + name);
  let depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const FN_NAMES = ["bdSnap", "bdBtns", "bdCommit", "bdPush", "bdGo", "bdUndo", "bdRedo",
  "bdClosable", "bdClose", "bdDelSel", "bdValidBoundary", "boundaryToPath", "bdLoad", "rgLoad", "rgZones", "rgZone"];
const FNS = FN_NAMES.map((n) => extractFn(survey, n)).join("\n");

// One sandbox per test. document is stubbed (getElementById → fake elements with .disabled); queueSave + renderBoundary
// are injected counters (as outline.test.mjs injects trPaint/trSync), so the pure history/commit logic runs for real.
function sandbox() {
  const els = {};
  const doc = { getElementById: (id) => els[id] || (els[id] = { disabled: false, style: {}, textContent: "", innerHTML: "", classList: { toggle() {}, contains: () => false } }) };
  const calls = { save: 0, paint: 0 };
  const factory = new Function(
    "document", "queueSave", "renderBoundary",
    `var regionMode=false,bdPts=[],bdClosed=false,bdDrag=-1,bdSel=-1,bdHist=[],bdHi=-1,bdDownPt=null,rgTarget={kind:"boundary"};
     var floors=[{}],curFloor=0;
     ${FNS}
     return {
       get bdPts(){return bdPts;}, set bdPts(v){bdPts=v;},
       get bdClosed(){return bdClosed;}, set bdClosed(v){bdClosed=v;},
       get bdSel(){return bdSel;}, set bdSel(v){bdSel=v;},
       get bdHist(){return bdHist;}, get bdHi(){return bdHi;}, set bdHi(v){bdHi=v;},
       get floors(){return floors;}, set floors(v){floors=v;},
       get curFloor(){return curFloor;}, set curFloor(v){curFloor=v;},
       bdSnap:bdSnap, bdBtns:bdBtns, bdCommit:bdCommit, bdPush:bdPush, bdGo:bdGo, bdUndo:bdUndo, bdRedo:bdRedo,
       bdClosable:bdClosable, bdClose:bdClose, bdDelSel:bdDelSel, bdValidBoundary:bdValidBoundary,
       boundaryToPath:boundaryToPath, bdLoad:bdLoad
     };`
  );
  const env = factory(doc, () => { calls.save++; }, () => { calls.paint++; });
  env.$ = (id) => doc.getElementById(id); env.calls = calls;
  env.bdLoad();   // mirror loadFloor: empty working boundary + one snapshot
  return env;
}
const add = (e, x, y) => { e.bdPts.push({ x, y }); e.bdPush(); };

// ---------- pure: %→SVG mapping ----------
test("boundaryToPath: {x,y} and [x,y] both map to an SVG points string, rounded to 3 dp", () => {
  const e = sandbox();
  assert.equal(e.boundaryToPath([{ x: 10, y: 20 }, { x: 30.12345, y: 40 }]), "10,20 30.123,40");
  assert.equal(e.boundaryToPath([[0, 0], [100, 100], [50.5, 12.3456]]), "0,0 100,100 50.5,12.346");
  assert.equal(e.boundaryToPath([]), "");
});

// ---------- pure: restore validation ----------
test("bdValidBoundary: null unless ≥3 valid points", () => {
  const e = sandbox();
  assert.equal(e.bdValidBoundary(null), null);
  assert.equal(e.bdValidBoundary({}), null);
  assert.equal(e.bdValidBoundary({ pts: [] }), null);
  assert.equal(e.bdValidBoundary({ pts: [[0, 0], [1, 1]] }), null);           // only 2
  assert.deepEqual(e.bdValidBoundary({ pts: [[0, 0], [1, 1], [2, 2]] }), { pts: [[0, 0], [1, 1], [2, 2]] });
});

test("bdValidBoundary: clamps to [0,100] and drops junk coords", () => {
  const e = sandbox();
  assert.deepEqual(e.bdValidBoundary({ pts: [[-5, 120], [50, 50], [200, -10]] }), { pts: [[0, 100], [50, 50], [100, 0]] });
  // junk ["x","y"] skipped; the three real points remain
  assert.deepEqual(e.bdValidBoundary({ pts: [[0, 0], ["x", "y"], [50, 50], [80, 80]] }), { pts: [[0, 0], [50, 50], [80, 80]] });
  // a single-element point is dropped; survivors still ≥3 → valid
  assert.deepEqual(e.bdValidBoundary({ pts: [[0, 0], [10], [50, 50], [80, 80]] }), { pts: [[0, 0], [50, 50], [80, 80]] });
});

test("bdValidBoundary: caps at 200 points", () => {
  const e = sandbox();
  const r = e.bdValidBoundary({ pts: Array.from({ length: 300 }, (_, i) => [i % 100, 50]) });
  assert.equal(r.pts.length, 200);
});

// ---------- edit model: add / close / delete / undo-redo ----------
test("starts empty: one snapshot, both buttons disabled, no boundary committed", () => {
  const e = sandbox();
  assert.equal(e.bdHist.length, 1);
  assert.equal(e.bdHi, 0);
  assert.equal(e.bdPts.length, 0);
  assert.equal(e.$("bdUndo").disabled, true);
  assert.equal(e.$("bdRedo").disabled, true);
  assert.ok(e.floors[0].boundary == null, "no boundary committed yet");
});

test("adding 3 vertices commits floor.boundary (≥3) and saves; under 3 commits null", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10);
  assert.equal(e.floors[0].boundary, null, "2 points → null boundary");
  add(e, 50, 90);
  assert.deepEqual(e.floors[0].boundary, { pts: [[10, 10], [90, 10], [50, 90]] });
  assert.ok(e.calls.save >= 3, "every edit queues a save");
  assert.equal(e.bdHist.length, 4);
  assert.equal(e.bdHi, 3);
});

test("close requires ≥3 and open; sets closed + pushes history", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10);
  e.bdClose();
  assert.equal(e.bdClosed, false, "cannot close with 2 points");
  add(e, 50, 90);
  e.bdClose();
  assert.equal(e.bdClosed, true);
  assert.equal(e.bdHist.length, 5);   // 3 adds + close
  e.bdClose();
  assert.equal(e.bdHist.length, 5, "already closed → no-op");
});

test("bdClosable: only the first dot of an open ≥3 polygon", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10);
  assert.equal(e.bdClosable(0), false, "needs ≥3");
  add(e, 50, 90);
  assert.equal(e.bdClosable(0), true);
  assert.equal(e.bdClosable(1), false);
  assert.equal(e.bdClosable(-1), false);
  e.bdClose();
  assert.equal(e.bdClosable(0), false, "closed → not closable again");
});

test("delete selected vertex from a closed polygon keeps it valid (≥3); a closed 3-gon refuses", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10); add(e, 50, 90); add(e, 20, 60); e.bdClose();   // closed quad
  e.bdSel = 1; e.bdDelSel();
  assert.equal(e.bdPts.length, 3, "a vertex is removed");
  assert.equal(e.bdClosed, true, "still a valid closed polygon");
  assert.equal(e.bdSel, -1, "selection cleared after delete");
  e.bdSel = 0; e.bdDelSel();                                                      // now a closed triangle
  assert.equal(e.bdPts.length, 3, "a closed 3-gon refuses deletion (min valid polygon)");
  assert.equal(e.bdClosed, true, "stays closed");
  assert.equal(e.bdSel, -1, "selection cleared");
});
test("delete selected vertex while still drawing (open) removes it", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10); add(e, 50, 90);   // open polyline, not closed
  e.bdSel = 1; e.bdDelSel();
  assert.equal(e.bdPts.length, 2, "open polyline can drop below 3 while drawing");
  assert.equal(e.bdSel, -1, "selection cleared after delete");
});

test("delete is a no-op with nothing selected or an out-of-range index", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10); add(e, 50, 90);
  const h = e.bdHist.length;
  e.bdSel = -1; e.bdDelSel();
  e.bdSel = 9; e.bdDelSel();
  assert.equal(e.bdPts.length, 3);
  assert.equal(e.bdHist.length, h);
});

test("undo / redo walk the history and restore closed state", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10); add(e, 50, 90);
  e.bdClose();                        // hi 4, closed
  e.bdUndo();                         // back to open 3-pt
  assert.equal(e.bdClosed, false);
  assert.equal(e.bdPts.length, 3);
  e.bdUndo();                         // 2 pts
  assert.equal(e.bdPts.length, 2);
  assert.equal(e.floors[0].boundary, null);
  e.bdRedo(); e.bdRedo();             // back to closed 3-pt
  assert.equal(e.bdClosed, true);
  assert.deepEqual(e.floors[0].boundary, { pts: [[10, 10], [90, 10], [50, 90]] });
});

test("a push after undo truncates the redo branch", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 20, 20); add(e, 30, 30);
  e.bdUndo(); e.bdUndo();             // at 1 point
  add(e, 90, 90);                     // new branch
  assert.equal(e.bdHist.length, 3);   // [empty, 1pt, 2pt-new]
  assert.equal(e.bdHi, 2);
  assert.equal(e.$("bdRedo").disabled, true);
});

test("undo/redo buttons track availability", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 20, 20);
  assert.equal(e.$("bdUndo").disabled, false);
  assert.equal(e.$("bdRedo").disabled, true);
  e.bdUndo();
  assert.equal(e.$("bdUndo").disabled, false);
  assert.equal(e.$("bdRedo").disabled, false);
  e.bdUndo();
  assert.equal(e.$("bdUndo").disabled, true);
  assert.equal(e.$("bdRedo").disabled, false);
});

test("history is capped at 100 (oldest dropped)", () => {
  const e = sandbox();
  for (let i = 0; i < 130; i++) add(e, i % 100, 50);
  assert.equal(e.bdHist.length, 100);
  assert.equal(e.bdHi, 99);
});

test("snapshots are copies — mutating live points does not rewrite history", () => {
  const e = sandbox();
  add(e, 10, 10); add(e, 90, 10); add(e, 50, 90);
  e.bdPts[0].x = 99;
  assert.equal(e.bdHist[3].p[0][0], 10);
});

// ---------- bdLoad: working state from the floor row ----------
test("bdLoad: a committed boundary loads closed, with a fresh single-snapshot history", () => {
  const e = sandbox();
  e.floors = [{ boundary: { pts: [[10, 10], [90, 10], [50, 90]] } }];
  e.curFloor = 0;
  e.bdLoad();
  assert.equal(e.bdPts.length, 3);
  assert.equal(e.bdClosed, true);
  assert.equal(e.bdHist.length, 1);
  assert.equal(e.bdHi, 0);
  assert.deepEqual(e.bdPts[0], { x: 10, y: 10 });
});

test("bdLoad: a floor with no / sub-3 boundary loads empty and open", () => {
  const e = sandbox();
  e.floors = [{ boundary: { pts: [[1, 1], [2, 2]] } }];
  e.curFloor = 0;
  e.bdLoad();
  assert.equal(e.bdPts.length, 0);
  assert.equal(e.bdClosed, false);
});

// ---------- source-reads: wiring the pure logic into the live widget ----------
test("#regionLayer is an SVG inside #scene at viewBox 0 0 100 100 (plate-% user units)", () => {
  assert.ok(survey.includes('<svg id="regionLayer" viewBox="0 0 100 100" preserveAspectRatio="none"'),
    "#regionLayer sits inside #scene, above the zone layer");
  assert.ok(/#regionLayer\{[^}]*pointer-events:none/.test(survey), "#regionLayer is pointer-events:none for display");
});

test("#regionBtn lives in .utils, icon-only with an aria-label (UI constitution)", () => {
  const utils = survey.slice(survey.indexOf('class="utils"'), survey.indexOf("</div>", survey.indexOf('id="bdRedo"')));
  assert.ok(utils.includes('id="regionBtn"'), "regionBtn is in the .utils bar");
  assert.ok(utils.includes('id="bdUndo"') && utils.includes('id="bdRedo"'), "undo/redo live beside it");
  assert.ok(/id="regionBtn"[^>]*aria-label="Regions"/.test(survey), "regionBtn has an aria-label");
  assert.ok(/id="regionBtn"[^>]*title="Regions"/.test(survey), "regionBtn has a tooltip");
});

test("renderView and fitScene both redraw the boundary", () => {
  assert.ok(extractFn(survey, "renderView").includes("renderBoundary()"), "renderView calls renderBoundary");
  assert.ok(extractFn(survey, "fitScene").includes("renderBoundary()"), "fitScene calls renderBoundary");
});

test("device placement + aim + drag are gated on !regionMode", () => {
  assert.ok(extractFn(survey, "placeAt").includes("regionMode"), "placeAt early-returns in Regions mode");
  assert.ok(survey.includes("inChrome(e)||regionMode"), "the scene pointerdown placement handler is gated");
  assert.ok(survey.includes("selId==null || regionMode"), "the angle-aim handler is gated");
  assert.ok(survey.includes('dot.addEventListener("pointerdown", function(e){ if(regionMode) return;'), "device drag is suspended");
});

test("regionBtn/editor are hidden for frozen (customer/submitted) views but the boundary still renders", () => {
  assert.ok(extractFn(survey, "updateRegionUI").includes("!frozen()"), "regionBtn hidden when frozen");
  assert.ok(extractFn(survey, "setRegionMode").includes("!frozen()"), "setRegionMode refuses when frozen");
  assert.ok(extractFn(survey, "renderBoundary").includes("regionMode && !frozen()"), "handles only in edit mode; the dashed polygon draws regardless");
  assert.ok(extractFn(survey, "renderBoundary").includes("Estimated boundary"), "the Estimated boundary chip label");
});

test("empty-tap with a selected vertex only deselects — never drops a stray vertex (Phase 2.3 lesson)", () => {
  assert.ok(survey.includes("if(bdSel>=0){ bdSel=-1; renderBoundary(); }"), "a selected dot: tap away only deselects");
  assert.ok(survey.includes("else if(!bdClosed){ var p=bdPt(e.clientX,e.clientY); bdPts.push({x:p.x,y:p.y}); bdPush(); }"),
    "open polygon: empty tap appends a corner");
  assert.ok(survey.includes("else { bdInsertOnEdge(e.clientX,e.clientY,16); }"),
    "closed polygon: a tap near an edge inserts a vertex (add-point on a closed boundary)");
});

test("two-finger gestures fall through to pinch-zoom (never a vertex)", () => {
  assert.ok(survey.includes("if(activePtrs.size>1){ bdDrag=-1; bdPlacing=false; hideLoupe(); return; }"), "multi-touch bails out of the region handlers (and cancels any placement/loupe)");
});

test("boundary is carried through restore, create and duplicate — and kept OFF snapFloor", () => {
  assert.ok(survey.includes("boundary:bdValidBoundary(f.boundary)"), "restore validates + carries boundary");
  assert.ok(survey.includes("boundary:(wp&&from.boundary)?JSON.parse(JSON.stringify(from.boundary)):null"), "createFloor deep-copies it when carrying the plan");
  assert.ok(survey.includes("boundary:src.boundary?JSON.parse(JSON.stringify(src.boundary)):null"), "duplicateFloor deep-copies it");
  assert.ok(!extractFn(survey, "snapFloor").includes("boundary"), "snapFloor must NOT touch boundary (it's floor view-state, written by bdCommit)");
});

test("undo/redo is keyboard-mapped while in Regions mode", () => {
  assert.ok(survey.includes('e.key==="z"||e.key==="Z"') && survey.includes("if(e.shiftKey) bdRedo(); else bdUndo();"), "Ctrl/Cmd+Z and Shift+Z");
  assert.ok(survey.includes('e.key==="y"||e.key==="Y"'), "Ctrl/Cmd+Y redo");
});

// ---------- precision boundary-vertex UX (tiny neutral nodes + shared loupe) ----------
test("vertices are tiny neutral charcoal dots — no giant white/gold handle, no inline red X", () => {
  const rb = extractFn(survey, "renderBoundary");
  assert.ok(rb.includes('fill="#2b2f36"'), "the node is a charcoal dot");
  assert.ok(!rb.includes('fill="'+'"'+'+(sel?hc:"#fff")') && !/r="\(sel\?hr\*1\.3:hr\)"/.test(rb), "the old white/gold selectable handle is gone");
  assert.ok(!rb.includes("#c0392b") && !rb.includes('class="bdDel"'), "no inline red X delete control on the canvas");
  assert.ok(rb.includes("px*100/_sw"), "dot size is a fixed px converted to plate-% (stays tiny at any zoom)");
});
test("the shared precision loupe is reused for boundary vertices (grab + drag), hidden on release", () => {
  // showLoupe/hideLoupe is the SAME camera-placement loupe (one implementation, not a boundary copy)
  assert.ok(survey.includes("function showLoupe(") && survey.includes("function hideLoupe("), "the shared loupe exists");
  const pd = survey.slice(survey.indexOf('rl.addEventListener("pointerdown"'), survey.indexOf('rl.addEventListener("pointercancel"'));
  assert.ok(/bdDrag=hit;[^]*?showLoupe\(e\.clientX,e\.clientY\)/.test(pd), "loupe shows on grabbing a vertex");
  assert.ok(pd.includes("bdPts[bdDrag]={x:p.x,y:p.y}; showLoupe(e.clientX,e.clientY)"), "loupe tracks the vertex while dragging");
  assert.ok(pd.includes("bdDrag=-1; hideLoupe();"), "loupe hides on release");
});
test("a large invisible grab radius keeps the tiny dot easy to hit (coarse pointer gets more)", () => {
  assert.ok(survey.includes('matchMedia("(pointer:coarse)").matches)?20:15'), "15px mouse / 20px touch grab radius, independent of the ~6px dot");
});
test("the bin deletes the selected vertex (contextual), else two-step clears the whole boundary", () => {
  assert.ok(survey.includes("if(bdSel>=0){ bdl.classList.remove(\"armed\"); bdDelSel(); return; }"), "a selected vertex → the bin deletes just that point");
  assert.ok(survey.includes('(e.key==="Delete"||e.key==="Backspace") && bdSel>=0'), "Delete/Backspace removes the selected vertex too");
});
