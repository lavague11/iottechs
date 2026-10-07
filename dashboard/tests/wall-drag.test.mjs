// Direct wall drag (draw-floorplan.html): repositioning an interior partition transfers a strip of cells
// between the two rooms it divides — one physical wall, both rooms stay consistent, clamped to the structure,
// never empties a room. Like the other widget tests we read the real source, brace-extract the pure helpers
// and evaluate them against stubbed globals. HALF=13, FULL=26; cells are "c,r" half-cell keys.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
function extractFn(s, name) {
  const start = s.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = s.indexOf("{", s.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < s.length; j++) { const ch = s[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return s.slice(start, j + 1); }
  throw new Error("unbalanced braces in " + name);
}

const HALF = 13, FULL = 26;
const NAMES = ["key", "has", "wallKey", "edgesOf", "boundaryEdges", "perimKeySet", "roomInteriorUnits",
  "segDistSq", "splitRuns", "wallRuns", "wallRunAt", "wallASide", "ownerIdxAt", "wallMovePlan",
  "applyWallMoves", "roomCellsClone", "roomCellsRestore", "roomsAllNonEmpty", "commitWallMove", "snappedWallB"];
const PURE = NAMES.map((n) => extractFn(src, n)).join("\n");
const api = new Function(`
  var HALF=${HALF}, FULL=${FULL}; var cells=new Set(), rooms=[], openWalls=new Set(), openings=[], snap=0.5, _pushes=0;
  function pushHist(){ _pushes++; } function redraw(){} function reconcileOpenings(){} function reconcileOpenWalls(){}
  function cellsSqFt(n){ return n; } function step(){ return snap*FULL; }
  ${PURE}
  return { key:key, has:has, wallRuns:wallRuns, wallRunAt:wallRunAt, wallASide:wallASide, wallMovePlan:wallMovePlan,
    applyWallMoves:applyWallMoves, commitWallMove:commitWallMove, snappedWallB:snappedWallB,
    setCells:function(a){ cells=new Set(a); }, setRooms:function(a){ rooms=a; }, setSnap:function(s){ snap=s; },
    rooms:function(){ return rooms; }, pushes:function(){ return _pushes; } };
`)();
const { key } = api;

// A 4-wide × 2-tall structure (half-cols 0..3, half-rows 0..1). Two side-by-side rooms share the x=26 wall (b=2).
const struct = [key(0,0),key(1,0),key(2,0),key(3,0),key(0,1),key(1,1),key(2,1),key(3,1)];
const freshRooms = () => ([
  { cells: [key(0,0),key(1,0),key(0,1),key(1,1)], label: "Dining" },
  { cells: [key(2,0),key(3,0),key(2,1),key(3,1)], label: "Living" },
]);
const cols = (room) => [...new Set(room.cells.map((k) => +k.split(",")[0]))].sort((a,b)=>a-b);
const setup = () => { api.setCells(struct); api.setRooms(freshRooms()); };

test("wallRuns: the shared partition is a single straight vertical run at the right boundary of Dining", () => {
  setup();
  const runs = api.wallRuns(api.rooms()[0]);
  assert.equal(runs.length, 1, "one interior wall run");
  assert.deepEqual({ orient: runs[0].orient, b: runs[0].b, lo: runs[0].lo, hi: runs[0].hi }, { orient: "v", b: 2, lo: 0, hi: 1 });
});

test("wallASide: Dining is on the low side of the shared wall, Living on the high side", () => {
  setup();
  const run = api.wallRuns(api.rooms()[0])[0];
  assert.equal(api.wallASide(api.rooms()[0], run), "neg", "Dining owns col b-1");
  assert.equal(api.wallASide(api.rooms()[1], run), "pos", "Living owns col b");
});

test("dragging the shared wall right: Dining grows, Living shrinks — one wall, both rooms consistent", () => {
  setup();
  const [dining, living] = api.rooms();
  const run = api.wallRuns(dining)[0];
  const moved = api.commitWallMove(dining, run, 3);   // boundary 2 → 3 (one half-col right)
  assert.ok(moved, "a move happened");
  assert.deepEqual(cols(dining), [0,1,2], "Dining gained the middle column");
  assert.deepEqual(cols(living), [3], "Living lost it — no gap, no overlap");
  assert.equal(dining.cells.length + living.cells.length, 8, "every structure cell still owned by exactly one room");
});

test("dragging the shared wall left: Dining shrinks and hands cells to Living (symmetric)", () => {
  setup();
  const [dining, living] = api.rooms();
  const run = api.wallRuns(dining)[0];
  api.commitWallMove(dining, run, 1);   // boundary 2 → 1 (left)
  assert.deepEqual(cols(dining), [0], "Dining shrank to one column");
  assert.deepEqual(cols(living), [1,2,3], "Living received the vacated column (shared wall)");
});

test("never empties a room: a drag past the neighbour is clamped so the neighbour keeps a cell", () => {
  setup();
  const [dining, living] = api.rooms();
  const run = api.wallRuns(dining)[0];
  api.commitWallMove(dining, run, 4);   // would consume ALL of Living → must step back to 3
  assert.deepEqual(cols(living), [3], "Living still has its last column");
  assert.ok(living.cells.length > 0 && dining.cells.length > 0, "both rooms survive");
});

test("clamped to the structure: a room can't grow beyond the building outline", () => {
  // Dining alone, filling cols 0..1; the right half (cols 2..3) is EMPTY structure, cols 4+ are outside.
  api.setCells(struct);
  api.setRooms([{ cells: [key(0,0),key(1,0),key(0,1),key(1,1)], label: "Dining" }]);
  const dining = api.rooms()[0];
  const run = api.wallRuns(dining)[0];           // right wall at b=2, facing empty structure
  api.commitWallMove(dining, run, 9);            // try to grow way past the structure
  assert.deepEqual(cols(dining), [0,1,2,3], "grew to fill the structure, clamped at the outline (no cols ≥ 4)");
});

test("snappedWallB honors the Snap setting (½ vs full grid)", () => {
  const run = { orient: "v" };
  api.setSnap(0.5); assert.equal(api.snappedWallB(run, 18, 0), 1, "half grid: 18px → nearest half-col 13px → b=1");
  api.setSnap(1);   assert.equal(api.snappedWallB(run, 18, 0), 2, "full grid: 18px → nearest full box 26px → b=2");
  api.setSnap(0.5);
});

test("commit pushes history (undoable) and a no-op move does not", () => {
  setup();
  const dining = api.rooms()[0], run = api.wallRuns(dining)[0], before = api.pushes();
  api.commitWallMove(dining, run, 2);   // same boundary → nothing
  assert.equal(api.pushes(), before, "no history for a zero move");
  api.commitWallMove(dining, run, 3);
  assert.equal(api.pushes(), before + 1, "a real move is one undo step");
});

test("wall drag is wired: pointerdown grabs the selected room's wall; move drives it; up commits; room mode only", () => {
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("contextmenu"'));
  assert.ok(pd.includes('var wr=wallRunAt(sel,pt.x,pt.y); if(wr){ pendingWall={run:wr, start:pt}; return; }'), "a grab on the selected room's wall starts a potential drag");
  const pm = src.slice(src.indexOf('cv.addEventListener("pointermove"'), src.indexOf('cv.addEventListener("pointerup"'));
  assert.ok(pm.includes("wallDrag={run:pendingWall.run}") && pm.includes("wallDrag.cur=pt"), "movement past a tap becomes a drag");
  const pu = src.slice(src.indexOf('cv.addEventListener("pointerup"'), src.indexOf('cv.addEventListener("pointerleave"'));
  assert.ok(pu.includes("commitWallMove(sel, wallDrag.run, b2)"), "release commits the move");
  assert.ok(pu.includes("var hh=roomHit(pw.start.x,pw.start.y)"), "a tap with no drag just (re)selects");
});
