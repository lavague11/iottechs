// Area naming parity (draw-floorplan.html): Areas are NAMED cell-union regions OUTSIDE the structure — the outdoor
// counterpart of Rooms. areas[] holds the free name; zoneCells is a typed cache synced from areas for the existing
// export/colour pipeline. We read the real widget, brace-extract the pure helpers, and eval them against stubs. HALF=13.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

function extractFn(s, name) {
  const start = s.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = s.indexOf("{", s.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return s.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const HALF = 13;
// Pull the real ZCLASS table so colours/type validation match the widget exactly.
const ZCLASS_SRC = src.slice(src.indexOf("var ZCLASS=["), src.indexOf("];", src.indexOf("var ZCLASS=[")) + 2);
const NAMES = ["key", "has", "cellAt", "edgesOf", "step", "dragCells", "zcGet", "zcOut", "zClassLabel",
  "areaTypeFor", "namedAreas", "areaHit", "isAreaSel", "syncZoneCellsFromAreas", "areasFromZoneCells",
  "sanitizeAreas", "areaDragCells", "reconcileAreas", "isAreaSelCandidate"];
const PURE = NAMES.map((n) => extractFn(src, n)).join("\n");
const api = new Function(`
  var HALF=${HALF}, FULL=26, snap=0.5;
  var cells=new Set(), rooms=[], areas=[], zoneCells={}, sel=null;
  ${ZCLASS_SRC}
  var ZCOL={}; ZCLASS.forEach(function(t){ ZCOL[t[0]]=t[2]; });
  function W(){ return 1000; } function H(){ return 1000; }
  ${PURE}
  return { key:key, cellAt:cellAt, areaTypeFor:areaTypeFor, namedAreas:namedAreas, areaHit:areaHit,
    syncZoneCellsFromAreas:syncZoneCellsFromAreas, areasFromZoneCells:areasFromZoneCells, sanitizeAreas:sanitizeAreas,
    areaDragCells:areaDragCells, reconcileAreas:reconcileAreas,
    setCells:function(a){ cells=new Set(a); }, setAreas:function(a){ areas=a; }, setSel:function(s){ sel=s; },
    getAreas:function(){ return areas; }, getSel:function(){ return sel; }, zoneCellsKeys:function(){ var o={}; for(var t in zoneCells){ o[t]=Array.from(zoneCells[t]).sort(); } return o; } };
`)();
const { key } = api;

// ---------- name → type (colour + typed cache) ----------
test("areaTypeFor maps common outdoor names → a ZCLASS type; unknown → exterior", () => {
  assert.equal(api.areaTypeFor("Driveway"), "driveway");
  assert.equal(api.areaTypeFor("Parking"), "parking");
  assert.equal(api.areaTypeFor("Backyard"), "rear-yard");
  assert.equal(api.areaTypeFor("Side Yard"), "side-yard");
  assert.equal(api.areaTypeFor("Front Yard"), "front-yard");
  assert.equal(api.areaTypeFor("Pool Area"), "exterior", "a custom name falls back to the generic exterior bucket");
});

// ---------- sanitize / migrate ----------
test("sanitizeAreas keeps valid {cells,label,semanticType}, drops junk, derives a type", () => {
  const out = api.sanitizeAreas([
    { cells: ["0,0", "1,0"], label: "Driveway" },
    { cells: [], label: "Empty" },            // no cells → dropped
    { cells: ["x", "2,2"], label: "Mixed" },  // junk cell dropped, survivor kept
    { label: "No cells" },                    // no cells array → dropped
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { cells: ["0,0", "1,0"], label: "Driveway", semanticType: "driveway" });
  assert.deepEqual(out[1].cells, ["2,2"], "the junk cell is stripped");
});
test("areasFromZoneCells migrates a legacy typed zoneCells → one named Area per type", () => {
  const areas = api.areasFromZoneCells({ driveway: new Set(["0,0", "1,0"]), "rear-yard": new Set(["5,5"]) });
  const byLabel = {}; areas.forEach((a) => { byLabel[a.label] = a; });
  assert.ok(byLabel["Driveway"] && byLabel["Rear Yard"], "each type becomes a named area (display label)");
  assert.deepEqual(byLabel["Driveway"].cells.sort(), ["0,0", "1,0"]);
  assert.equal(byLabel["Driveway"].semanticType, "driveway");
});
test("syncZoneCellsFromAreas rebuilds the typed cache (named areas → type buckets)", () => {
  api.setAreas([{ cells: ["0,0", "1,0"], label: "Driveway", semanticType: "driveway" }, { cells: ["9,9"], label: "Pool Area", semanticType: "exterior" }]);
  api.syncZoneCellsFromAreas();
  const zc = api.zoneCellsKeys();
  assert.deepEqual(zc.driveway, ["0,0", "1,0"]);
  assert.deepEqual(zc.exterior, ["9,9"], "a custom-named area lands in the exterior bucket for colour/export");
});

// ---------- outside-structure constraint + hit test ----------
test("areaDragCells keeps only cells OUTSIDE the building (Structure wins)", () => {
  api.setCells([key(0, 0), key(1, 0)]);                 // the building occupies 0,0 and 1,0
  const cs = api.areaDragCells({ x: 0, y: 0 }, { x: 3 * HALF, y: HALF });   // a drag spanning cols 0..2, row 0
  assert.ok(cs.every((cr) => !(cr[0] <= 1 && cr[1] === 0)), "cells the building occupies are excluded from the area");
});
test("areaHit finds the top area whose cells contain the point", () => {
  api.setCells([]); api.setAreas([{ cells: [key(2, 2)], label: "Driveway" }]);
  const a = api.areaHit(2 * HALF + 3, 2 * HALF + 3);
  assert.ok(a && a.label === "Driveway");
  assert.equal(api.areaHit(80 * HALF, 80 * HALF), null, "a point in no area → null");
});
test("reconcileAreas drops area cells the building now occupies (a device there stays INDOOR)", () => {
  api.setAreas([{ cells: [key(0, 0), key(5, 5)], label: "Driveway", semanticType: "driveway" }]);
  api.setCells([key(0, 0)]);                            // the building grew over the area's 0,0 cell
  api.reconcileAreas();
  assert.deepEqual(api.getAreas()[0].cells, [key(5, 5)], "the overlapped cell is removed; the rest of the area stays");
});

// ---------- interaction + persistence (source reads) ----------
test("Area mode = draw outside → name it (like a room); named area selects, rename is explicit", () => {
  const pu = src.slice(src.indexOf('cv.addEventListener("pointerup"'), src.indexOf('cv.addEventListener("pointerleave"'));
  assert.ok(pu.includes("var al=areaDragCells(startPt,dragCur||startPt)") && pu.includes("openLabel(ash,true)"), "a drag outside creates an area then opens naming");
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("contextmenu"'));
  assert.ok(pd.includes('var ah=areaHit(pt.x,pt.y)') && pd.includes('var an=(ah.label||"").trim()') && pd.includes('if(!an) openLabel(ah,true)'), "named area selects on click; unnamed names");
});
test("areas persist + migrate + ride history; outdoor label is free text, placement is OUTSIDE structure", () => {
  assert.ok(src.includes("areas:namedAreas(areas)"), "planOut persists named areas");
  assert.ok(src.includes("sanitizeAreas(s.areas)") && src.includes("areasFromZoneCells(zcIn(s.zoneCells))"), "applyPlan loads areas, else migrates legacy zoneCells");
  assert.ok(src.includes("areas:JSON.parse(JSON.stringify(areas))"), "undo snapshots areas");
  assert.ok(extractFn(src, "planRev").includes('"A:"'), "the raster rev includes the named areas");
  assert.ok(extractFn(src, "reconcileRooms").includes("reconcileAreas()"), "structural edits reconcile areas (Structure wins)");
});

// #2: drawn Areas must READ as drawn — a continuous perimeter + label baked into the plan SVG, over a subtle fill.
test("areasSVG bakes a continuous area perimeter + label into every plan SVG builder", () => {
  const fn = extractFn(src, "areasSVG");
  assert.ok(fn.includes('fill="none" stroke="rgb(') && fn.includes('stroke-width="1.3"') && !fn.includes("stroke-dasharray"), "a thin CONTINUOUS perimeter (not dashed, not a wall)");
  assert.ok(fn.includes('paint-order="stroke"') && fn.includes("esc(name)"), "the area name with a white halo at a valid interior point");
  ["sketchSVG", "planLayerSVG", "overlaySVG"].forEach((b) => assert.ok(extractFn(src, b).includes("areasSVG(fs)"), b + " pushes the area perimeter+label layer"));
  // the editor outline is continuous too
  assert.ok(extractFn(src, "drawAreas").includes("thin CONTINUOUS perimeter"), "editor draws a continuous area outline");
});
