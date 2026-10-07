// Phase 6.2 — doors / openings on wall segments (draw-floorplan.html).
// The widget is single-file ES5 HTML with no exports, so — like rooms.test.mjs / boundary.test.mjs — we read the
// real source, brace-extract the pure helpers and evaluate them against stubbed globals. If the widget drifts,
// these run the drifted code (or fail to find it). Cells are "c,r" HALF-cell keys; HALF=13. A wall UNIT is a
// HALF-length edge keyed "x1,y1,x2,y2" (smaller endpoint first); an opening is {a:[x,y],b:[x,y]} on one such unit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

// Return the full text of `function name(...){...}` (brace-matched, string/comment tolerant enough for this widget).
function extractFn(s, name) {
  const start = s.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = s.indexOf("{", s.indexOf(")", start));
  assert.ok(i > 0, "no body for " + name);
  let depth = 0, quote = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const HALF = 13, FULL = 26;
// Build a live mini-module: the real pure helpers + stubbed pushHist/redraw, with mutable cells/rooms/openings.
const NAMES = ["key", "has", "edgesOf", "boundaryEdges", "ptLess", "wallKey", "canonOpening", "openKey",
  "segDistSq", "allWallUnits", "allDoorUnits", "nearestWallUnit", "sanitizeOpenings", "segMidOnWall", "reconcileOpenings", "openSet", "toggleOpeningAt",
  "cellsBBoxPx", "roomLabelCell", "esc", "doorArcD", "wallPathD", "svgPlanBody"];
const PURE = NAMES.map((n) => extractFn(src, n)).join("\n");
const api = new Function(`
  var HALF=${HALF}, FULL=${FULL}; var cells=new Set(), rooms=[], openings=[], _pushes=0;
  function pushHist(){ _pushes++; } function redraw(){}
  ${PURE}
  return { key:key, wallKey:wallKey, canonOpening:canonOpening, openKey:openKey, allWallUnits:allWallUnits,
    nearestWallUnit:nearestWallUnit, sanitizeOpenings:sanitizeOpenings, reconcileOpenings:reconcileOpenings,
    toggleOpeningAt:toggleOpeningAt,
    svgBody:function(){ var o=[]; svgPlanBody(o, 3.5, 2, 9); return o.join(""); },
    setCells:function(a){ cells=new Set(a); }, setRooms:function(a){ rooms=a; }, setOpenings:function(a){ openings=a; },
    getOpenings:function(){ return openings; }, pushes:function(){ return _pushes; } };
`)();
const { key, wallKey, canonOpening, openKey, allWallUnits, nearestWallUnit, sanitizeOpenings, reconcileOpenings, toggleOpeningAt } = api;

// A 2x2 half-cell box occupying cols 0..1, rows 0..1 → an 8-unit perimeter, no interior walls.
const box2 = [key(0, 0), key(1, 0), key(0, 1), key(1, 1)];

// ---------- wallKey / canonOpening / openKey ----------
test("wallKey is canonical — endpoint order doesn't matter", () => {
  assert.equal(wallKey(13, 0, 0, 0), "0,0,13,0");
  assert.equal(wallKey(0, 0, 13, 0), "0,0,13,0");
  assert.equal(wallKey(13, 13, 13, 0), "13,0,13,13", "sorts by x then y");
});
test("canonOpening orders a<b lexicographically; openKey matches wallKey", () => {
  const o = canonOpening([13, 0], [0, 0]);
  assert.deepEqual(o, { a: [0, 0], b: [13, 0] });
  assert.equal(openKey(o), wallKey(0, 0, 13, 0));
});

// ---------- allWallUnits ----------
test("allWallUnits: the structure shell's perimeter units, no interior units when unpartitioned", () => {
  api.setRooms([]); api.setOpenings([]); api.setCells(box2);
  const u = allWallUnits();
  assert.ok(u["0,0,13,0"], "top-left perimeter unit present");
  assert.ok(u["0,13,0,26"], "a left-edge perimeter unit present");
  assert.ok(!u["13,0,13,13"], "the interior seam between the two columns is NOT a wall (no room splits it)");
  assert.equal(Object.keys(u).length, 8, "exactly the 8 perimeter HALF-units");
});
test("allWallUnits: a room partition contributes its interior walls", () => {
  // two side-by-side 1x2 rooms share the x=13 seam → that seam becomes a real wall unit.
  api.setCells(box2); api.setRooms([{ cells: [key(0, 0), key(0, 1)] }, { cells: [key(1, 0), key(1, 1)] }]); api.setOpenings([]);
  const u = allWallUnits();
  assert.ok(u["13,0,13,13"] && u["13,13,13,26"], "the shared partition is now in the wall-unit set");
});

// ---------- reconcileOpenings ----------
test("reconcileOpenings: a door on a current wall survives; one on a vanished wall drops", () => {
  api.setCells(box2); api.setRooms([]);
  api.setOpenings([canonOpening([0, 0], [13, 0]), canonOpening([100, 100], [113, 100])]);
  reconcileOpenings();
  const o = api.getOpenings();
  assert.equal(o.length, 1, "only the opening on a real wall unit is kept");
  assert.equal(openKey(o[0]), "0,0,13,0");
});
test("reconcileOpenings: a door on a shared wall drops once a merge makes that wall interior", () => {
  api.setCells(box2);
  api.setRooms([{ cells: [key(0, 0), key(0, 1)] }, { cells: [key(1, 0), key(1, 1)] }]);
  api.setOpenings([canonOpening([13, 0], [13, 13])]);  // a door on the shared partition
  reconcileOpenings();
  assert.equal(api.getOpenings().length, 1, "survives while the partition exists");
  // merge the two rooms → the seam is now interior to one set → no longer a wall unit
  api.setRooms([{ cells: box2.slice() }]);
  reconcileOpenings();
  assert.equal(api.getOpenings().length, 0, "the door on the now-interior shared wall is reconciled away");
});

// ---------- sanitizeOpenings: validation / canonical / dedupe / cap / default ----------
test("sanitizeOpenings: non-array / junk → []", () => {
  assert.deepEqual(sanitizeOpenings(undefined), []);
  assert.deepEqual(sanitizeOpenings(null), []);
  assert.deepEqual(sanitizeOpenings("x"), []);
});
test("sanitizeOpenings: drops non-finite and degenerate, re-canonicalises order", () => {
  const out = sanitizeOpenings([
    { a: [13, 0], b: [0, 0] },            // reversed → canonicalised
    { a: [0, 0], b: [0, 0] },             // degenerate → dropped
    { a: [0, NaN], b: [13, 0] },          // non-finite → dropped
    { a: [0, 0] },                        // missing b → dropped
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { a: [0, 0], b: [13, 0] }, "canonical-ordered");
});
test("sanitizeOpenings: dedupes identical units (incl. reversed)", () => {
  const out = sanitizeOpenings([{ a: [0, 0], b: [13, 0] }, { a: [13, 0], b: [0, 0] }]);
  assert.equal(out.length, 1, "the same wall unit is stored once");
});
test("sanitizeOpenings: caps at ~200", () => {
  const many = [];
  for (let i = 0; i < 300; i++) many.push({ a: [i * 13, 0], b: [i * 13 + 13, 0] });
  assert.equal(sanitizeOpenings(many).length, 200, "hard cap keeps the list bounded");
});

// ---------- planOut / applyPlan round-trip (sanitizeOpenings is the exact function both use) ----------
test("planOut/applyPlan round-trip openings, defaulting to [] when absent", () => {
  const list = [canonOpening([0, 0], [13, 0]), canonOpening([13, 13], [13, 0])];
  const persisted = sanitizeOpenings(list);          // what planOut writes
  const restored = sanitizeOpenings(persisted);      // what applyPlan reads back
  assert.deepEqual(restored, persisted, "a valid list survives a write→read round-trip unchanged");
  assert.deepEqual(sanitizeOpenings(({}).openings), [], "a plan with no openings restores as []");
});

// ---------- the toggle ----------
test("toggleOpeningAt: a tap near a wall snaps to a FULL-cell door, a second tap removes it, pushHist each time", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]);
  const before = api.pushes();
  toggleOpeningAt(6.5, 1);                             // over the top edge → the full-cell slot [0,0]-[26,0]
  let o = api.getOpenings();
  assert.equal(o.length, 1, "door added");
  assert.equal(openKey(o[0]), "0,0,26,0", "a door spans a full cell (26px), not a half unit");
  toggleOpeningAt(6.5, 1);
  assert.equal(api.getOpenings().length, 0, "same tap toggles it back off");
  assert.equal(api.pushes() - before, 2, "each toggle is a history step");
});
test("toggleOpeningAt: a tap far from any wall is ignored (no door, no history)", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]);
  const before = api.pushes();
  toggleOpeningAt(500, 500);
  assert.equal(api.getOpenings().length, 0, "nothing placed");
  assert.equal(api.pushes(), before, "no history step for a miss");
});
test("nearestWallUnit: snaps to the nearest FULL-cell door slot, null beyond reach", () => {
  api.setCells(box2); api.setRooms([]);
  assert.equal(openKey(canonOpening(nearestWallUnit(6.5, 1).a, nearestWallUnit(6.5, 1).b)), "0,0,26,0", "a full-cell door slot");
  assert.equal(nearestWallUnit(500, 500), null, "a far tap snaps to nothing");
});

// ---------- functional SVG render: the opaque export actually draws the gap + swing arc ----------
test("svgPlanBody: no openings → the wall path has NO gap and NO door arc (byte-identical scene)", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]);
  const noDoor = api.svgBody();
  assert.ok(noDoor.includes("M0 0L13 0"), "the full top-left wall unit is stroked end to end");
  assert.ok(!/A\d/.test(noDoor) && !noDoor.includes("stroke-opacity"), "no door arc, no light door layer");
});
test("svgPlanBody: a full-cell door leaves ONE continuous gap (no mid-wall stub) and emits a light swing arc", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([canonOpening([0, 0], [26, 0])]);
  const withDoor = api.svgBody();
  assert.ok(!withDoor.includes("M0 0L13 0") && !withDoor.includes("M13 0L26 0"), "neither half of the top edge is stroked — the whole cell is open");
  assert.ok(/stroke-opacity="0\.5"/.test(withDoor) && /A26 26 /.test(withDoor), "a lighter door layer with a radius = full door width (26) swing arc is drawn");
});

// ---------- source-reads: wiring the pure logic into the live widget ----------
test("Openings mode: an icon-only toolbar button, aria + title 'Openings', inline SVG, no emoji", () => {
  const i = src.indexOf('id="tOpening"');
  assert.ok(i >= 0, "the Openings button exists");
  const bs = src.lastIndexOf("<button", i), btn = src.slice(bs, src.indexOf("</button>", bs));
  assert.ok(/class="tb ico"/.test(btn), "icon-only tb button");
  assert.ok(/aria-label="Openings"/.test(btn) && /title="Openings"/.test(btn), "aria-label + title");
  assert.ok(/<svg /.test(btn), "inline SVG icon");
  assert.equal(btn.replace(/<[^>]*>/g, "").trim(), "", "no text label — icon only");
  assert.ok(!/[\u{1F000}-\u{1FAFF}☀-➿]/u.test(btn), "no emoji");
});
test("setMode supports 'opening': toggles the button on, shows the door hint, pointer cursor", () => {
  const setMode = extractFn(src, "setMode");
  assert.ok(setMode.includes('to.classList.toggle("on",m==="opening")'), "the Openings button reflects the mode");
  assert.ok(setMode.includes("Tap a wall to add a door."), "opening-mode hint");
  assert.ok(setMode.includes('m==="opening" ? "pointer"'), "pointer cursor in opening mode");
  assert.ok(setMode.includes('if(m!=="opening") hoverWall=null'), "leaving opening mode clears the hover highlight");
  assert.ok(src.includes('setMode(mode==="opening" ? "structure" : "opening")'), "the button toggles the mode");
  assert.ok(src.includes('$("tOpening").addEventListener("click"') && src.includes("cells.size===0) return"), "guarded: no doors without walls");
});
test("pointerdown taps a wall (toggleOpeningAt) in opening mode; structure/room editing is suspended", () => {
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("pointermove"'));
  assert.ok(pd.includes('if(mode==="opening"){ toggleOpeningAt(pt.x,pt.y); return; }'), "opening tap intercepts before the structure/room branches");
  assert.ok(pd.indexOf('mode==="opening"') < pd.indexOf('mode==="structure"'), "the opening branch is gated first");
});
test("pointermove highlights the hovered wall unit in opening mode", () => {
  assert.ok(src.includes('else if(mode==="opening"){ hoverWall=nearestWallUnit(pt.x,pt.y); redraw(); }'), "hover tracks the nearest wall unit");
  assert.ok(extractFn(src, "drawPreview").includes('mode==="opening" && hoverWall'), "drawPreview strokes the hovered unit");
});
test("render: walls paint through the shared door-aware helpers (canvas + SVG)", () => {
  assert.ok(extractFn(src, "drawStructure").includes("paintWalls(boundaryEdges()"), "structure shell strokes via paintWalls");
  assert.ok(extractFn(src, "drawRoom").includes("paintWalls(edgesOf(set)"), "room walls stroke via paintWalls");
  assert.ok(extractFn(src, "svgPlanBody").includes("wallPathD(edgesOf(set)") && extractFn(src, "svgPlanBody").includes("wallPathD(boundaryEdges()"), "SVG walls build via wallPathD");
  assert.ok(extractFn(src, "svgPlanBody").includes("hit.map(doorArcD)") && extractFn(src, "svgPlanBody").includes("hit.length"), "SVG collects + emits door arcs");
});
test("render guard: an undoored wall is stroked solid; doors are a coverage-based gap + separate arc pass", () => {
  const wp = extractFn(src, "wallPathD");
  assert.ok(wp.includes('d+="M"+s[0]+" "+s[1]+"L"+s[2]+" "+s[3];'), "an uncovered SVG edge is the plain 'M..L..' segment");
  assert.ok(wp.includes("segDistSq(mx,my") && wp.includes("if(inD) return;"), "a segment inside a door is skipped (one continuous gap)");
  const pw = extractFn(src, "paintWalls");
  assert.ok(pw.includes("ctx.moveTo(s[0],s[1]); ctx.lineTo(s[2],s[3]);"), "an uncovered canvas edge is a plain moveTo/lineTo");
  assert.ok(pw.includes("if(hit.length) paintDoorArcs"), "door arcs are a separate pass, only for covered openings");
});
test("reconcile hooks: reconcileRooms and doMerge both call reconcileOpenings", () => {
  assert.ok(extractFn(src, "reconcileRooms").includes("reconcileOpenings()"), "every structural reconcile drops stale doors");
  assert.ok(extractFn(src, "doMerge").includes("reconcileOpenings()"), "a merge drops a door on the now-interior shared wall");
});
test("persistence: openings ride the plan record (planOut/applyPlan) and history (snapshot/applySnap)", () => {
  assert.ok(extractFn(src, "planOut").includes("openings:sanitizeOpenings(openings)"), "planOut writes a sanitized list");
  const ap = extractFn(src, "applyPlan");
  assert.ok(ap.includes("openings=[]") && ap.includes("openings=sanitizeOpenings(s.openings)"), "applyPlan defaults [] then restores + sanitizes");
  assert.ok(extractFn(src, "snapshot").includes("openings:JSON.parse(JSON.stringify(openings))"), "undo snapshots openings");
  assert.ok(extractFn(src, "applySnap").includes("openings=sanitizeOpenings(s.openings||[])"), "undo restores openings");
});
test("toggleOpeningAt pushes history", () => {
  assert.ok(extractFn(src, "toggleOpeningAt").includes("pushHist()"), "placing/removing a door is undoable");
});
