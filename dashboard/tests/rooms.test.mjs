// Phase 6.1 — room MERGE + interior ("pole of inaccessibility") label placement (draw-floorplan.html).
// The widget is single-file ES5 HTML with no exports, so — like boundary.test.mjs / outline.test.mjs — we read the
// real source, extract the pure helpers with a brace matcher and evaluate them against stubbed globals. If the
// widget drifts, these tests run the drifted code (or fail to find it). Cells are "c,r" HALF-cell keys; HALF=13.
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

const HALF = 13;
// Evaluate the pure helpers for real: key + cellsBBoxPx are their own deps; HALF is injected as a const.
const PURE = ["key", "cellsBBoxPx", "roomLabelCell", "mergeRooms"].map((n) => extractFn(src, n)).join("\n");
const api = new Function(`var HALF=${HALF};\n${PURE}\nreturn { key:key, cellsBBoxPx:cellsBBoxPx, roomLabelCell:roomLabelCell, mergeRooms:mergeRooms };`)();
const { key, roomLabelCell, mergeRooms } = api;

// px centre [cx,cy] → the half-cell key it sits in.
const cellOf = ([cx, cy]) => key(Math.floor(cx / HALF), Math.floor(cy / HALF));
// Build a rectangle of cell keys spanning cols c0..c1, rows r0..r1 (inclusive).
function rect(c0, c1, r0, r1) { const a = []; for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) a.push(key(c, r)); return a; }

// ---------- roomLabelCell: pole of inaccessibility ----------
test("roomLabelCell: a 1-cell room returns that cell's centre", () => {
  const p = roomLabelCell([key(4, 7)]);
  assert.deepEqual(p, [4 * HALF + HALF / 2, 7 * HALF + HALF / 2]);
  assert.equal(cellOf(p), key(4, 7));
});

test("roomLabelCell: empty → [0,0]", () => {
  assert.deepEqual(roomLabelCell([]), [0, 0]);
  assert.deepEqual(roomLabelCell(null), [0, 0]);
});

test("roomLabelCell: a rectangle resolves to ~its centre (bbox centre ≈ pole)", () => {
  // 5x5 (cols 0..4, rows 0..4): the geometric centre is the middle cell (2,2).
  const cells = rect(0, 4, 0, 4);
  const p = roomLabelCell(cells);
  assert.equal(cellOf(p), key(2, 2), "label sits in the centre cell");
  // within half a cell of the true bbox centre (32.5,32.5)
  assert.ok(Math.abs(p[0] - 32.5) <= HALF / 2 && Math.abs(p[1] - 32.5) <= HALF / 2, "≈ bbox centre");
});

test("roomLabelCell: an L-shape lands INSIDE the thick arm, never the concave notch", () => {
  // L = a 3-wide vertical arm (cols 0..2, rows 0..5) + a foot (cols 3..5, rows 3..5).
  // The bbox is cols 0..5 rows 0..5; its centre (≈ cell (2 or 3, 2 or 3)) is fine, but the TOP-RIGHT
  // quadrant (cols 3..5, rows 0..2) is the NOTCH — empty. The old bbox-centre could drift there; the pole can't.
  const cells = rect(0, 2, 0, 5).concat(rect(3, 5, 3, 5));
  const set = new Set(cells);
  const p = roomLabelCell(cells);
  assert.ok(set.has(cellOf(p)), "label cell is a real member of the room");
  const a = cellOf(p).split(",").map(Number);
  // the notch is cols>=3 AND rows<=2 — the result must not be there
  assert.ok(!(a[0] >= 3 && a[1] <= 2), "not in the concave notch");
});

test("roomLabelCell: a plus/cross puts the label at the dead centre (most interior)", () => {
  // a + shape: the centre cell (2,2) is the only one fully surrounded → strictly most interior.
  const cells = rect(2, 2, 0, 4).concat(rect(0, 4, 2, 2));
  const p = roomLabelCell(cells);
  assert.equal(cellOf(p), key(2, 2), "the fully-enclosed hub wins the distance transform");
});

test("roomLabelCell: deeper interior beats a shallow one (distance transform, not bbox)", () => {
  // A fat blob (cols 0..4, rows 0..4) with a thin 1-wide tail poking right at row 2.
  // The blob has a genuinely interior cell (dist>=2); every tail cell touches outside (dist 1) → blob wins.
  const cells = rect(0, 4, 0, 4).concat([key(5, 2), key(6, 2), key(7, 2)]);
  const p = roomLabelCell(cells);
  const a = cellOf(p).split(",").map(Number);
  assert.ok(a[0] <= 4, "label stays in the thick blob, not out along the 1-wide tail");
});

// ---------- mergeRooms: pure union ----------
test("mergeRooms: unions cells (unique, A-order first)", () => {
  const a = { cells: [key(0, 0), key(1, 0)], label: "Kitchen", semanticType: "kitchen" };
  const b = { cells: [key(1, 0), key(2, 0)], label: "Pantry", semanticType: "storage" };
  const m = mergeRooms(a, b);
  assert.deepEqual(m.cells, [key(0, 0), key(1, 0), key(2, 0)], "shared cell not duplicated, A first");
});

test("mergeRooms: keeps A's label; takes B's only when A has none", () => {
  assert.equal(mergeRooms({ cells: [], label: "Office" }, { cells: [], label: "Den" }).label, "Office");
  assert.equal(mergeRooms({ cells: [], label: "" }, { cells: [], label: "Den" }).label, "Den");
  assert.equal(mergeRooms({ cells: [], label: "  " }, { cells: [], label: "Den" }).label, "Den", "whitespace label counts as none");
});

test("mergeRooms: keeps A's semanticType; takes B's real type only when A is empty/custom", () => {
  assert.equal(mergeRooms({ cells: [], semanticType: "kitchen" }, { cells: [], semanticType: "bath" }).semanticType, "kitchen");
  assert.equal(mergeRooms({ cells: [], semanticType: "" }, { cells: [], semanticType: "bath" }).semanticType, "bath");
  assert.equal(mergeRooms({ cells: [], semanticType: "custom" }, { cells: [], semanticType: "bath" }).semanticType, "bath");
  // B is custom/empty → A (custom/empty) is preserved, never overwritten by another non-real type
  assert.equal(mergeRooms({ cells: [], semanticType: "custom" }, { cells: [], semanticType: "custom" }).semanticType, "custom");
  assert.equal(mergeRooms({ cells: [], semanticType: "" }, { cells: [], semanticType: "" }).semanticType, "");
});

test("mergeRooms: null-safe", () => {
  const a = { cells: [key(0, 0)], label: "A" };
  assert.deepEqual(mergeRooms(a, null), a);
  assert.deepEqual(mergeRooms(null, a), a);
});

// ---------- source-reads: wiring the pure logic into the live widget ----------
test("roomLabelCell is used for the label anchor in redraw (drawRoom) + both SVG/PNG exports", () => {
  const drawRoom = extractFn(src, "drawRoom");
  assert.ok(drawRoom.includes("roomLabelCell(r.cells||[])"), "on-canvas label uses the pole anchor");
  assert.ok(!/cx=bb\.x\+bb\.w\/2/.test(drawRoom), "the old bbox-centre label anchor is gone from drawRoom");
  assert.ok(extractFn(src, "svgPlanBody").includes("roomLabelCell(r.cells||[])"), "vector export uses the pole anchor");
  assert.ok(extractFn(src, "sketchPNG").includes("roomLabelCell(r.cells||[])"), "raster export uses the pole anchor");
});

test("Merge action lives in the More menu, one word, inline SVG, hidden by default", () => {
  assert.ok(/<button id="mMergeRoom"[^>]*style="display:none"><svg /.test(src), "mMergeRoom is an SVG button, hidden until armed");
  const bs = src.lastIndexOf("<button", src.indexOf('id="mMergeRoom"'));
  const btn = src.slice(bs, src.indexOf("</button>", bs));
  assert.equal(btn.replace(/<[^>]*>/g, "").trim(), "Merge", "visible label is the single word Merge");
  assert.ok(!/[\u{1F000}-\u{1FAFF}☀-➿]/u.test(btn), "no emoji icon");
  // the menu button order keeps Merge beside (just above) Delete room
  assert.ok(src.indexOf('id="mMergeRoom"') < src.indexOf('id="mDeleteRoom"'), "Merge sits beside Delete room");
});

test("Merge is shown only when a room is selected (and a second room exists to merge into)", () => {
  assert.ok(src.includes('$("mMergeRoom").style.display=(hasRoom&&rooms.length>1)?"":"none"'),
    "the More-menu open gates Merge on a selected room + >1 room");
});

test("Merge click arms a one-shot pick (startMerge), guarded on busy/selection", () => {
  assert.ok(src.includes('$("mMergeRoom").addEventListener("click", function(){ if(busy||!sel) return; startMerge();'),
    "the Merge button is guarded and calls startMerge");
  const startMerge = extractFn(src, "startMerge");
  assert.ok(startMerge.includes("mergeArmed=sel"), "startMerge arms the selected room as the target A");
  assert.ok(startMerge.includes("busy") && startMerge.includes('planState!=="loaded"'), "guarded like the other room actions");
  assert.ok(startMerge.includes("Tap a room to merge"), "shows the pick hint");
});

test("the merge pick: tapping room B unions into A, drops B, re-selects A, pushHist", () => {
  const pd = src.slice(src.indexOf('cv.addEventListener("pointerdown"'), src.indexOf('cv.addEventListener("pointermove"'));
  assert.ok(pd.includes("if(mergeArmed){ var mb=roomHit(pt.x,pt.y); if(mb && mb!==mergeArmed) doMerge(mergeArmed, mb); else endMerge();"),
    "pointerdown intercepts the pick before any drawing; empty/same room cancels");
  const doMerge = extractFn(src, "doMerge");
  assert.ok(doMerge.includes("mergeRooms(a,b)"), "unions via the pure helper");
  assert.ok(doMerge.includes("rooms.filter(function(x){ return x!==b; })"), "removes B");
  assert.ok(doMerge.includes("reconcileRooms()"), "re-clips to the structure");
  assert.ok(doMerge.includes("pushHist()"), "undoable");
  assert.ok(/sel=null; if\(anchor\)/.test(doMerge), "selection re-points to the reconciled merged room");
});

test("Escape cancels an armed merge (endMerge) before other Escape branches", () => {
  assert.ok(src.includes("if(mergeArmed){ endMerge(); return; } if(backToDraw())"),
    "Escape disarms the merge pick");
  assert.ok(extractFn(src, "endMerge").includes('setMode("room")'), "endMerge restores the room hint/cursor");
});
