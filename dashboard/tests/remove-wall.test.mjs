// Room editing refactor (draw-floorplan.html): click-to-select vs explicit rename, and the Remove Wall tool.
// Remove Wall separates WALL VISIBILITY from ROOM GEOMETRY — hiding a partition never changes a room's cells,
// area, name, or device context. A shared edge is ONE canonical key, so opening it removes a single line for
// both rooms while they stay separate. Like openings.test.mjs we read the real widget, brace-extract the pure
// helpers, and eval them against stubbed globals. HALF=13.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

function extractFn(s, name) {
  const start = s.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = s.indexOf("{", s.indexOf(")", start));
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

const HALF = 13;
const FULL = 26;
const NAMES = ["key", "has", "edgesOf", "boundaryEdges", "ptLess", "wallKey", "canonOpening", "openKey",
  "segDistSq", "perimKeySet", "roomInteriorUnits", "interiorUnits", "nearestInteriorUnit", "toggleOpenWallAt", "removeAllWalls", "reconcileOpenWalls",
  "sanitizeOpenWalls", "cellsBBoxPx", "roomLabelCell", "esc", "doorArcD", "wallPathD"];
const PURE = NAMES.map((n) => extractFn(src, n)).join("\n");
const api = new Function(`
  var HALF=${HALF}, FULL=${FULL}; var cells=new Set(), rooms=[], openings=[], openWalls=new Set(), sel=null, _pushes=0, snap=0.5;
  function pushHist(){ _pushes++; } function redraw(){}
  ${PURE}
  return { key:key, wallKey:wallKey, perimKeySet:perimKeySet, roomInteriorUnits:roomInteriorUnits,
    interiorUnits:interiorUnits, nearestInteriorUnit:nearestInteriorUnit, toggleOpenWallAt:toggleOpenWallAt,
    removeAllWalls:removeAllWalls, reconcileOpenWalls:reconcileOpenWalls, sanitizeOpenWalls:sanitizeOpenWalls,
    wallPath:function(edgeSet){ return wallPathD(edgesOf(new Set(edgeSet)), [], []); },
    setCells:function(a){ cells=new Set(a); }, setRooms:function(a){ rooms=a; }, setSel:function(r){ sel=r; }, setSnap:function(s){ snap=s; },
    openWallsArr:function(){ return Array.from(openWalls); }, addOpen:function(k){ openWalls.add(k); }, clearOpen:function(){ openWalls=new Set(); },
    pushes:function(){ return _pushes; } };
`)();
const { key } = api;

// A 4-wide × 2-tall half-cell building. Two side-by-side rooms share the x=26 vertical edge (interior).
const building = [key(0,0),key(1,0),key(2,0),key(3,0),key(0,1),key(1,1),key(2,1),key(3,1)];
const dining = { cells: [key(0,0),key(1,0),key(0,1),key(1,1)], label: "Dining", semanticType: "dining" };
const living = { cells: [key(2,0),key(3,0),key(2,1),key(3,1)], label: "Living", semanticType: "living" };
const setup = () => { api.setCells(building); api.setRooms([dining, living]); api.clearOpen(); };

// ---------- interior vs structure perimeter ----------
test("roomInteriorUnits = the room's partition walls, never the building shell", () => {
  setup();
  const di = api.roomInteriorUnits(dining).map((u) => u.k).sort();
  assert.deepEqual(di, ["26,0,26,13", "26,13,26,26"], "only the shared interior edge (2 half-units)");
  const perim = api.perimKeySet();
  di.forEach((k) => assert.ok(!perim[k], "an interior unit is NOT a building-perimeter unit"));
  // the room's outer edges (on the shell) are excluded
  assert.ok(!di.includes("0,0,0,13"), "the left shell edge is not a removable room wall");
});

test("a shared wall is ONE canonical key for both rooms (no duplicated line)", () => {
  setup();
  const di = api.roomInteriorUnits(dining).map((u) => u.k).sort();
  const li = api.roomInteriorUnits(living).map((u) => u.k).sort();
  assert.deepEqual(di, li, "Dining and Living resolve the shared edge to the SAME keys");
});

// ---------- rendering: an open wall leaves no line, geometry untouched ----------
test("opening a wall removes its stroke from the plan (and the room cells are unchanged)", () => {
  setup();
  const withWall = api.wallPath(dining.cells);
  assert.ok(withWall.includes("M26 0L26 13"), "the shared wall is stroked by default");
  api.addOpen("26,0,26,13"); api.addOpen("26,13,26,26");
  const open = api.wallPath(dining.cells);
  assert.ok(!open.includes("M26 0L26 13") && !open.includes("M26 13L26 26"), "an open wall is not stroked");
  // geometry is untouched — the room still owns the same cells
  assert.deepEqual(dining.cells, [key(0,0),key(1,0),key(0,1),key(1,1)], "room cells unchanged by Remove Wall");
});

// ---------- Snap setting: a wall opens one whole grid box at a time on full-grid snap ----------
test("interiorUnits respects Snap: half snap = half units; full snap coalesces a box edge into ONE unit", () => {
  setup();
  api.setSnap(0.5);
  const half = api.interiorUnits(dining);
  assert.deepEqual(half.map((u) => u.id).sort(), ["26,0,26,13", "26,13,26,26"], "half snap keeps the two half-units");
  api.setSnap(1);
  const full = api.interiorUnits(dining);
  assert.equal(full.length, 1, "full snap coalesces the shared edge into one whole-box unit");
  assert.deepEqual(full[0].keys.sort(), ["26,0,26,13", "26,13,26,26"], "the one unit toggles BOTH half keys");
  assert.deepEqual([full[0].a, full[0].b], [[26, 0], [26, 26]], "spanning the full grid box");
  api.setSnap(0.5);
});
test("toggleOpenWallAt on full snap opens the WHOLE box in one tap (both halves), not half at a time", () => {
  setup(); api.setSel(dining); api.setSnap(1);
  api.toggleOpenWallAt(26, 13);   // tap the shared partition
  assert.deepEqual(api.openWallsArr().sort(), ["26,0,26,13", "26,13,26,26"], "one tap opens both halves of the grid box");
  api.toggleOpenWallAt(26, 13);
  assert.deepEqual(api.openWallsArr(), [], "a second tap restores the whole box");
  api.setSnap(0.5);
});

// ---------- Remove All / Restore All ----------
test("removeAllWalls toggles every interior wall of a room, then restores them", () => {
  setup();
  const before = api.pushes();
  api.removeAllWalls(dining);
  assert.deepEqual(api.openWallsArr().sort(), ["26,0,26,13", "26,13,26,26"], "all interior walls hidden");
  api.removeAllWalls(dining);
  assert.deepEqual(api.openWallsArr(), [], "a second call restores them (all-open → restore all)");
  assert.equal(api.pushes() - before, 2, "each is one undo step");
});

// ---------- reconcile + backwards-compat ----------
test("reconcileOpenWalls drops keys that are no longer an interior room wall", () => {
  setup();
  api.addOpen("26,0,26,13"); api.addOpen("999,0,999,13");   // one real interior key + one stale key
  api.reconcileOpenWalls();
  assert.deepEqual(api.openWallsArr(), ["26,0,26,13"], "only a current interior wall key survives");
});

test("sanitizeOpenWalls: validates 'x,y,x,y' strings, dedupes, drops junk, caps; absent ⇒ none", () => {
  assert.deepEqual(api.sanitizeOpenWalls(undefined), [], "absent/non-array → [] (every wall visible)");
  assert.deepEqual(api.sanitizeOpenWalls(["26,0,26,13", "26,0,26,13", "x", 7, "1,2,3"]), ["26,0,26,13"], "valid, deduped, junk dropped");
});

// ---------- persistence wiring (source reads) ----------
test("openWalls rides the plan record, history snapshots, and the raster rev", () => {
  assert.ok(src.includes("openWalls:sanitizeOpenWalls(Array.from(openWalls))"), "planOut writes a sanitized list");
  assert.ok(extractFn(src, "applyPlan").includes("openWalls=new Set()") && src.includes("openWalls=new Set(sanitizeOpenWalls(s.openWalls))"), "applyPlan defaults empty then restores");
  assert.ok(extractFn(src, "snapshot").includes("openWalls:Array.from(openWalls)"), "undo snapshots open walls");
  assert.ok(extractFn(src, "applySnap").includes("openWalls=new Set(sanitizeOpenWalls(s.openWalls||[]))"), "undo restores open walls");
  assert.ok(extractFn(src, "planRev").includes('"W:"+Array.from(openWalls).sort().join'), "the raster rev includes open walls");
  assert.ok(extractFn(src, "reconcileRooms").includes("reconcileOpenWalls()") && extractFn(src, "doMerge").includes("reconcileOpenWalls()"), "structural edits reconcile open walls");
});

// ---------- interaction: click selects a NAMED room; rename is explicit ----------
test("a named room selects on click; naming only auto-opens when unnamed", () => {
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("contextmenu"'));
  assert.ok(pd.includes('var hn=(h.label||"").trim()') && pd.includes("if(!hn) openLabel(h)"), "only an UNNAMED room auto-opens the naming UI");
  assert.ok(!pd.includes("sel=h; redraw(); openLabel(h); return;"), "a named room no longer re-opens rename on click");
  assert.ok(!pd.includes("openRoomMenu(h,false); }") || pd.includes('e.pointerType!=="mouse"'), "a mouse single-click never opens the actions menu");
});

// ---------- Room Actions menu: double-click / second-tap opens actions; Rename is explicit ----------
test("single click selects only — it does not open Rename or the actions menu (mouse)", () => {
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("contextmenu"'));
  // the only auto-open on a plain click is the UNNAMED naming field; the actions menu is gated on a non-mouse second tap
  assert.ok(pd.includes('if(h===sel && hn && e.pointerType!=="mouse"){ openRoomMenu(h,false); return; }'), "touch second-tap on the selected room opens actions; mouse does not");
  assert.ok(pd.includes("sel=h; redraw(); if(!hn) openLabel(h);"), "a plain click just selects (names only if unnamed)");
});
test("double-click opens the Room Actions menu — never the Rename field directly", () => {
  const dc = src.slice(src.indexOf('cv.addEventListener("dblclick"'), src.indexOf('cv.addEventListener("pointermove"'));
  assert.ok(dc.includes("if(h) openRoomMenu(h,false)") && dc.includes("if(a) openRoomMenu(a,true)"), "double-click a room/area opens the actions menu");
  assert.ok(!dc.includes("openLabel"), "double-click no longer opens the rename input directly");
});
test("Room Actions menu order is Merge, Remove wall, Rename, then a separated Delete", () => {
  const menu = src.slice(src.indexOf('id="roomMenu"'), src.indexOf('id="roomMenu"') + 700);
  const order = ["rmMerge", "rmRemoveWall", "rmRename", "rmsep", "rmDelete"].map((id) => menu.indexOf(id));
  assert.ok(order.every((i) => i >= 0), "all actions + the separator are present");
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], "actions are in Merge → Remove wall → Rename → ─ → Delete order");
  assert.ok(/id="rmDelete"[^>]*class="danger"/.test(menu), "Delete is the destructive (danger) action");
});
test("Rename opens the naming field ONLY when chosen from the menu; it is a pure name input (no inline Merge/Delete)", () => {
  assert.ok(src.includes('$("rmRename").addEventListener("click"') && src.includes("openLabel(r, a); })"), "Rename action opens the naming UI");
  assert.ok(!src.includes('id="lpMerge"') && !src.includes('id="lpDel"'), "the rename popover's inline Merge/Delete icons are gone");
  const ol = extractFn(src, "openLabel");
  assert.ok(!ol.includes("lpDel") && !ol.includes("lpMerge"), "openLabel no longer wires inline action icons");
});
test("Merge / Remove wall actions route into the existing workflows", () => {
  assert.ok(src.includes('$("rmMerge").addEventListener("click"') && src.includes("if(sel) startMerge(); })"), "Merge enters the existing merge workflow");
  assert.ok(src.includes('$("rmRemoveWall").addEventListener("click"') && src.includes('setMode(mode==="removewall" ? "room" : "removewall")'), "Remove wall enters the wall-selection mode");
});
test("Delete uses a destructive confirm; closing the menu is wired to outside-click and Escape", () => {
  assert.ok(src.includes('$("rmDelete").addEventListener("click"') && src.includes("askConfirm({ title:a?\"Delete area?\":\"Delete room?\", ok:\"Delete\", danger:true }"), "Delete runs the destructive confirm");
  assert.ok(src.includes('!$("roomMenu").contains(e.target)) closeRoomMenu();'), "an outside pointerdown closes the menu");
  assert.ok(src.includes('if(e.key!=="Escape") return;') && src.includes('if($("roomMenu").classList.contains("on")){ e.preventDefault(); closeRoomMenu(); return; }'), "Escape closes the menu");
});
test("newly created rooms/areas still auto-open naming (first-creation naming is unchanged)", () => {
  const pu = src.slice(src.indexOf('cv.addEventListener("pointerup"'), src.indexOf('cv.addEventListener("pointerup"') + 2000);
  assert.ok(pu.includes("openLabel(shape)") || pu.includes("openLabel(ash,true)"), "a freshly drawn room/area opens the naming UI on creation");
});

// ---------- Remove wall is an ACTION on the selected room, never a canvas lock ----------
test("Remove wall: room selection always wins — a click reselects another room; a wall tap toggles the selected room's wall", () => {
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("contextmenu"'));
  assert.ok(pd.includes('if(sel && nearestInteriorUnit(sel,pt.x,pt.y)){ toggleOpenWallAt(pt.x,pt.y); return; }'), "a tap on the selected room's wall toggles it");
  assert.ok(pd.includes('var rhw=roomHit(pt.x,pt.y); if(rhw && rhw!==sel){ sel=rhw; redraw(); }'), "a tap on another room reselects it (Remove wall then targets it)");
  assert.ok(!pd.includes('if(mode==="removewall"){ toggleOpenWallAt(pt.x,pt.y); return; }'), "the old canvas-locking branch is gone");
});
test("Remove wall: double-click opens Room Actions even while active; Escape exits the action", () => {
  const dc = src.slice(src.indexOf('cv.addEventListener("dblclick"'), src.indexOf('cv.addEventListener("pointermove"'));
  assert.ok(dc.includes('mode==="room"||mode==="removewall"'), "double-click opens Room Actions in room OR remove-wall mode");
  assert.ok(src.includes('if(mode==="removewall"){ e.preventDefault(); setMode("room"); }'), "Escape leaves Remove wall (no Done required)");
});
test("Remove wall is entered from the Room Actions menu, not the ••• menu; ••• keeps only Remove all / Rotate stairs / Delete room", () => {
  assert.ok(src.includes('$("rmRemoveWall").addEventListener("click"'), "Remove wall is a Room Actions item");
  assert.ok(!src.includes('id="mRemoveWall"') && !src.includes('id="mMergeRoom"') && !src.includes('id="mRenameRoom"'), "Rename / Merge / Remove wall are removed from the ••• menu");
  assert.ok(src.includes('$("mRemoveAllWalls").addEventListener') && src.includes("removeAllWalls(sel)"), "Remove all / Restore all stays in ••• (a bulk sub-action)");
});
test("the PRIMARY selector always names the geometry type — Remove wall is never the dock label", () => {
  const sm = extractFn(src, "setMode");
  assert.ok(!sm.includes('"Remove wall"'), "the mode toggle never shows 'Remove wall'");
  assert.ok(sm.includes('m==="zone" ? "Area" : "Room"'), "remove-wall falls back to the Room label");
});
