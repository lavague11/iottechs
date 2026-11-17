// Section E - Layout drawing tools. Pure geometry/list logic lives in public/widgets/draw-geom.js (shared by the
// draw iframe and these tests); the widget is wired to it, and the plan fingerprint must not move for untouched floors.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { toolFingerprint } from "../lib/tool-data.js";

const require = createRequire(import.meta.url);
const G = require("../public/widgets/draw-geom.js");
const html = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
const host = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

// ---- 15 dimension label vs room names
test("dim label never covers a room name", () => {
  const bb = { x: 100, y: 100, w: 400, h: 300 };
  const size = { w: 90, h: 20 };
  // a name sitting exactly where the pill would go above the footprint
  const name = { x: 255, y: 70, w: 100, h: 18 };
  const pos = G.dimLabelPos(bb, size, [name], { x: 0, y: 0, w: 900, h: 700 });
  assert.equal(G.rectsOverlap(pos, name, 2), false);
  assert.ok(pos.clear);
});
test("dim label falls back around the footprint, and prefers above when clear", () => {
  const bb = { x: 100, y: 100, w: 400, h: 300 }, size = { w: 90, h: 20 }, vis = { x: 0, y: 0, w: 900, h: 700 };
  const above = G.dimLabelPos(bb, size, [], vis);
  assert.ok(above.y + above.h <= bb.y, "above the footprint when nothing is in the way");
  const blockedAbove = { x: 0, y: 60, w: 900, h: 40 }, blockedBelow = { x: 0, y: 405, w: 900, h: 40 };
  const side = G.dimLabelPos(bb, size, [blockedAbove, blockedBelow], vis);
  assert.equal(G.rectsOverlap(side, blockedAbove, 2) || G.rectsOverlap(side, blockedBelow, 2), false);
});
test("dim label at the top edge goes below, never inside over a name", () => {
  const bb = { x: 100, y: 4, w: 400, h: 300 }, size = { w: 90, h: 20 };
  const inner = { x: 280, y: 140, w: 100, h: 18 };
  const pos = G.dimLabelPos(bb, size, [inner], { x: 0, y: 0, w: 900, h: 700 });
  assert.equal(G.rectsOverlap(pos, inner, 2), false);
  assert.ok(pos.y >= bb.y + bb.h || pos.y + pos.h <= bb.y || pos.x + pos.w <= bb.x || pos.x >= bb.x + bb.w, "outside the footprint");
});
test("rotated name box swaps its dimensions", () => {
  const r = G.nameRect(50, 50, 80, 18, true);
  assert.deepEqual([r.w, r.h], [18, 80]);
});
test("widget draws the footprint pill through dimLabelPos with the name boxes", () => {
  assert.ok(html.includes("IOTDrawGeom.dimLabelPos(bb,{w:bw,h:bh},names"), "uses the placement function");
  assert.ok(html.includes("function nameRects()"), "collects room + area name boxes");
});

// ---- 14 area names
test("area list: Street in, Backyard out", () => {
  assert.ok(G.AREA_NAMES.includes("Street"));
  assert.ok(!G.AREA_NAMES.includes("Backyard"));
  assert.ok(G.AREA_NAMES.includes("Rear Yard"));
  assert.ok(html.includes("var AREA_NAMES=IOTDrawGeom.AREA_NAMES"), "the widget reads the shared list");
  assert.ok(!/AREA_NAMES=\[/.test(html), "no second hand-typed copy");
});

// ---- 8 + 9 mode menu
test("mode order: Structure, Room, Area, Opening, Stairs, Block - no Eraser", () => {
  assert.deepEqual(G.MODES.map(m => m[1]), ["Structure", "Room", "Area", "Opening", "Stairs", "Block"]);
  const menu = html.slice(html.indexOf('id="modeMenu"'), html.indexOf("</div>", html.indexOf('id="modeMenu"')));
  const order = [...menu.matchAll(/data-m="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ["structure", "room", "zone", "opening", "stairs", "block"]);
  assert.ok(!/data-m="eraser"/.test(menu), "Eraser left the mode menu (the Add/Erase toggle is the eraser)");
});

// ---- 12 nested rooms
const garage = { cells: ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "0,2", "1,2", "2,2"], label: "Garage" };
test("a room drawn wholly inside another nests; one that spills over does not", () => {
  assert.equal(G.isNested(["1,1"], [garage]), true);
  assert.equal(G.isNested(["1,1", "2,1"], [garage]), true);
  assert.equal(G.isNested(["2,2", "3,2"], [garage]), false, "spills outside");
  assert.equal(G.isNested(garage.cells.slice(), [garage]), false, "identical cells replace, not nest");
  assert.equal(G.isNested(["1,1"], []), false);
});
test("hit-test inside two nested rooms picks the inner room, in either array order", () => {
  const booth = { cells: ["1,1"], label: "Paint Booth" };
  assert.equal(G.roomAtKey([garage, booth], "1,1"), booth);
  assert.equal(G.roomAtKey([booth, garage], "1,1"), booth);
  assert.equal(G.roomAtKey([garage, booth], "0,0"), garage);
  assert.equal(G.roomAtKey([garage, booth], "9,9"), null);
});
test("paint order draws the container before the nested room", () => {
  const booth = { cells: ["1,1"] };
  assert.deepEqual(G.paintOrder([booth, garage]), [garage, booth]);
});
// Found by exercising the tool in a browser: the nested room paints OVER its container, so a container
// name anchored at the container's centre ends up buried in the inner room's fill ("Garage" under Stairs).
test("a container's name anchors in its own free floor, never under a nested room", () => {
  const booth = { cells: ["1,1"], label: "Paint Booth" };
  const free = G.freeCells(garage, [garage, booth]);
  assert.equal(free.includes("1,1"), false, "the nested room's cells are not candidates for the container's name");
  assert.equal(free.length, garage.cells.length - 1);
  assert.deepEqual(G.freeCells(booth, [garage, booth]), booth.cells, "the nested room itself keeps all of its cells");
  assert.deepEqual(G.freeCells(garage, [garage]), garage.cells, "no nesting → unchanged");
});
test("freeCells ignores overlaps that are not nesting, and never empties a room", () => {
  const spill = { cells: ["2,2", "3,2"] };                       // overlaps the corner but is not inside
  assert.deepEqual(G.freeCells(garage, [garage, spill]), garage.cells, "a spilling room is not a nested child");
  const twin = { cells: garage.cells.slice() };                  // same size → neither contains the other
  assert.deepEqual(G.freeCells(garage, [garage, twin]), garage.cells);
  const covered = { cells: ["0,0"] };
  assert.deepEqual(G.freeCells(covered, [covered, { cells: ["0,0"] }]), ["0,0"], "a fully covered room keeps a place for its name");
  assert.deepEqual(G.freeCells({ cells: [] }, []), []);
});
test("every room label in the widget is anchored through freeCells", () => {
  assert.equal(/roomLabelCell\(r\.cells\|\|\[\]\)/.test(html), false, "no room label still anchors at the raw cell list");
  assert.equal((html.match(/roomLabelCell\(IOTDrawGeom\.freeCells\(r,rooms\)\)/g) || []).length, 4,
    "canvas, the dim-pill name boxes and both SVG exports agree");
});

// ---- 10 shapes
test("shapes: circle and triangle are strict subsets of the square", () => {
  const sq = G.shapeCells("square", 0, 0, 7, 7), ci = G.shapeCells("circle", 0, 0, 7, 7), tr = G.shapeCells("triangle", 0, 0, 7, 7);
  assert.equal(sq.length, 64);
  assert.ok(ci.length > 0 && ci.length < 64 && tr.length > 0 && tr.length < ci.length + 64);
  assert.ok(!ci.some(([c, r]) => c === 0 && r === 0), "circle leaves the corner out");
  assert.ok(ci.some(([c, r]) => c === 3 && r === 3), "circle keeps the centre");
  assert.ok(!tr.some(([c, r]) => c === 0 && r === 0), "triangle apex row is narrow");
  assert.ok(tr.some(([c, r]) => r === 7), "triangle base row is wide");
});
test("multi-point closes only on the first point with 3+ corners", () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(G.closesPolygon(pts, { x: 4, y: 3 }, 10), true);
  assert.equal(G.closesPolygon(pts, { x: 100, y: 100 }, 10), false, "a later corner does not close");
  assert.equal(G.closesPolygon(pts.slice(0, 2), { x: 0, y: 0 }, 10), false, "needs 3 corners");
  assert.equal(G.closesPolygon([], { x: 0, y: 0 }, 10), false);
});
test("polygon fills the cells whose centre is inside", () => {
  const cells = G.polygonCells([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], 10).map(c => c.join(","));
  assert.equal(cells.length, 16);
  const tri = G.polygonCells([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }], 10);
  assert.ok(tri.length > 0 && tri.length < 16);
  assert.deepEqual(G.polygonCells([{ x: 0, y: 0 }, { x: 5, y: 5 }], 10), []);
});

// ---- 11 select
test("box select hits every item the marquee touches, not the rest", () => {
  const items = [{ id: "a", cells: ["0,0", "1,0"] }, { id: "b", cells: ["5,5"] }, { id: "c", cells: ["9,9"] }];
  assert.deepEqual(G.boxSelect(items, { c0: 1, r0: 0, c1: 5, r1: 5 }).map(i => i.id), ["a", "b"]);
  assert.deepEqual(G.boxSelect(items, { c0: 5, r0: 5, c1: 1, r1: 0 }).map(i => i.id), ["a", "b"], "any drag direction");
  assert.deepEqual(G.boxSelect(items, { c0: 20, r0: 20, c1: 30, r1: 30 }), []);
});
test("moving a selection shifts every cell together", () => {
  assert.deepEqual(G.shiftKeys(["0,0", "-1,2"], 2, -1), ["2,-1", "1,1"]);
});

// ---- widget wiring
test("widget wires select, shapes, stairs, block, rotate-name and right-click", () => {
  for (const id of ['id="tShapes"', 'id="tSelect"', 'id="rmRotate"', 'data-s="poly"', 'data-s="circle"', 'data-s="triangle"', 'data-s="square"'])
    assert.ok(html.includes(id), id);
  assert.ok(/cv\.addEventListener\("contextmenu"[\s\S]{0,700}openRoomMenu\(rh,false\)/.test(html), "right-click opens the room menu");
  assert.ok(html.includes('{cells:rk, label:"Stairs", semanticType:"stairs"}'), "Stairs mode creates a stairs room");
  assert.ok(html.includes("if(blocks.length) o.blocks="), "blocks persist only when drawn");
  assert.ok(html.includes("draw-geom.js?v="), "geometry module is loaded");
});
test("drawSrc cache key was bumped so the draw iframe actually reloads", () => {
  assert.ok(/draw-floorplan\.html\?v=20261116-sectionE3/.test(host), "the draw iframe key");
  assert.ok(/draw-geom\.js\?v=20261116-sectionE3/.test(html), "the geometry module key moves with it");
});

// ---- the constraint: planHash of an untouched floor
const plan = { v: 1, cells: ["0,0", "1,0", "0,1", "1,1"], rooms: [{ cells: ["0,0", "1,0"], label: "Office", semanticType: "office" }], areas: [{ cells: ["5,5"], label: "Street" }] };
const survey = p => JSON.stringify({ submitted: true, floors: [{ name: "Floor 1", started: true, devices: [{ k: "cam", x: 10, y: 20 }], plan: p }] });
test("an existing floor's fingerprint is byte-identical to the pre-Section-E value", () => {
  assert.equal(toolFingerprint("survey2", survey(plan)), "1x5g6fk");   // computed with lib/tool-data.js at HEAD before this change
  assert.equal(toolFingerprint("survey2", survey({ ...plan, blocks: [] })), "1x5g6fk", "an empty blocks list never moves it");
});
test("a drawn Block does move the fingerprint (it is part of what the customer approves)", () => {
  assert.notEqual(toolFingerprint("survey2", survey({ ...plan, blocks: [{ cells: ["9,9"] }] })), "1x5g6fk");
});

// Found auditing the spec's own "unchecked" note. svgPlanBody DRAWS blocks (a solid black area that
// is not the customer's property), but the export viewBox came from planCells() — structure + rooms
// only. A Block is by definition outside the property, so it sat outside the box and was clipped out
// of the PNG, the stored plan SVG and the AI overlay.
test("an export's viewBox includes blocks; the footprint dimension still does not", () => {
  assert.match(html, /function planBoundsCells\(\)\{ var arr=planCells\(\);[\s\S]{0,180}blocks/, "a block-aware cell list exists");
  // the three EXPORT bboxes use it
  assert.match(html, /function sketchPNG\(\)\{\s*\n\s*var arr=planBoundsCells\(\);/, "raster export");
  assert.match(html, /else \{ var arr=planBoundsCells\(\);/, "vector export");
  assert.match(html, /function overlaySVG\(\)\{ var arr=planBoundsCells\(\);/, "AI overlay");
  // ...and planFeet does NOT: a block is not the customer's building, so folding it into the
  // footprint would overstate their square footage.
  const pf = html.slice(html.indexOf("function planFeet("), html.indexOf("function planFeet(") + 400);
  assert.match(pf, /var arr=planCells\(\);/, "the footprint stays on the customer's own cells");
  assert.doesNotMatch(pf, /planBoundsCells/, "a block must never inflate the stated square footage");
  // and svgPlanBody really does paint them, which is why the box has to reach
  assert.match(html, /\(blocks\|\|\[\]\)\.forEach\([\s\S]{0,220}fill="#101112"/, "blocks are drawn in the export body");
});
