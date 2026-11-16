/* IOT TECHS — pure geometry + list logic for the floor-plan draw tool (draw-floorplan.html).
   No DOM, no canvas, no state: everything takes plain data and returns plain data, so it is unit-tested
   (tests/draw-tools.test.mjs). Cells are "c,r" keys on the half-cell grid, exactly as the widget stores them.
   Loaded in the browser as window.IOTDrawGeom; require()-able from node. */
(function (root) {
  "use strict";

  // Mode menu — ONE ordered list (the DOM menu is built from it). Eraser is deliberately absent: erasing is the
  // Add/Erase toggle that every paint mode already has.
  var MODES = [["structure", "Structure"], ["room", "Room"], ["zone", "Area"], ["opening", "Opening"], ["stairs", "Stairs"], ["block", "Block"]];

  // Area-name suggestions. Street in, Backyard out (it duplicated Rear Yard; areaTypeFor still maps a legacy
  // "Backyard" name to the rear-yard type, so saved plans keep their colour/type).
  var AREA_NAMES = ["Driveway", "Parking", "Front Yard", "Rear Yard", "Side Yard", "Street", "Patio", "Pool Area", "Loading Area", "Alley", "Entrance", "Sidewalk", "Walkway", "Garden", "Courtyard", "Deck", "Porch"];

  function rectsOverlap(a, b, pad) {
    pad = pad || 0;
    return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  }

  // Box a centred, optionally 90-degree-rotated, label of textW x textH occupies.
  function nameRect(cx, cy, textW, textH, rotated) {
    var w = rotated ? textH : textW, h = rotated ? textW : textH;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }

  // Where the "W × H ft" pill goes: the first candidate that clears EVERY room-name box (and stays on the
  // visible bounds). Candidates run above the footprint, below it, then the outer left/right gutters, and finally
  // further out — always outside the footprint first, because that is where names are not.
  // bb = footprint box, size = {w,h} of the pill in world px, avoid = [rect], bounds = visible world rect (optional).
  function dimLabelPos(bb, size, avoid, bounds) {
    var gap = 6, w = size.w, h = size.h, cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    var cands = [
      { x: cx - w / 2, y: bb.y - gap - h },
      { x: cx - w / 2, y: bb.y + bb.h + gap },
      { x: bb.x - gap - w, y: cy - h / 2 },
      { x: bb.x + bb.w + gap, y: cy - h / 2 },
      { x: cx - w / 2, y: bb.y - gap - h * 2.2 },
      { x: cx - w / 2, y: bb.y + bb.h + gap + h * 1.2 }
    ];
    function ok(r) {
      if (bounds && (r.x < bounds.x || r.y < bounds.y || r.x + w > bounds.x + bounds.w || r.y + h > bounds.y + bounds.h)) return false;
      for (var i = 0; i < (avoid || []).length; i++) if (rectsOverlap({ x: r.x, y: r.y, w: w, h: h }, avoid[i], 2)) return false;
      return true;
    }
    for (var i = 0; i < cands.length; i++) if (ok(cands[i])) return { x: cands[i].x, y: cands[i].y, w: w, h: h, clear: true };
    // Nothing fits on screen without a clash: take the first candidate that merely clears the names (off-bounds
    // is better than covering a name), else the first one.
    for (var j = 0; j < cands.length; j++) {
      var clear = true;
      for (var k = 0; k < (avoid || []).length; k++) if (rectsOverlap({ x: cands[j].x, y: cands[j].y, w: w, h: h }, avoid[k], 2)) { clear = false; break; }
      if (clear) return { x: cands[j].x, y: cands[j].y, w: w, h: h, clear: true };
    }
    return { x: cands[0].x, y: cands[0].y, w: w, h: h, clear: false };
  }

  // ---- nested rooms ------------------------------------------------------------------------------------
  // A new room drawn ENTIRELY inside an existing room nests (Paint Booth in Garage): the outer room keeps its
  // cells. Anything else keeps the original rule — a cell belongs to one room, the new one takes it.
  function isNested(newKeys, rooms) {
    if (!newKeys || !newKeys.length) return false;
    for (var i = 0; i < (rooms || []).length; i++) {
      var s = {}; (rooms[i].cells || []).forEach(function (k) { s[k] = 1; });
      var all = true; for (var j = 0; j < newKeys.length; j++) if (!s[newKeys[j]]) { all = false; break; }
      if (all && (rooms[i].cells || []).length > newKeys.length) return true;   // strictly larger → a real container
    }
    return false;
  }
  // Hit-test a cell among possibly overlapping rooms: the SMALLEST room containing it wins (the inner room),
  // later rooms win ties — independent of array order, so merge/undo can't flip which room is "on top".
  function roomAtKey(rooms, k) {
    var best = null, bn = Infinity;
    for (var i = 0; i < (rooms || []).length; i++) {
      var c = rooms[i].cells || [];
      if (c.indexOf(k) >= 0 && c.length <= bn) { best = rooms[i]; bn = c.length; }
    }
    return best;
  }
  // Paint order: large first, so an inner room is drawn over its container.
  function paintOrder(rooms) {
    return (rooms || []).map(function (r, i) { return { r: r, i: i }; })
      .sort(function (a, b) { return ((b.r.cells || []).length - (a.r.cells || []).length) || (a.i - b.i); })
      .map(function (x) { return x.r; });
  }

  // ---- shapes ------------------------------------------------------------------------------------------
  function pointInPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // Cells (c,r half-cell indices, inclusive box c0..c1 x r0..r1) covered by a shape fitted to that box.
  function shapeCells(kind, c0, r0, c1, r1) {
    var a = Math.min(c0, c1), b = Math.max(c0, c1), c = Math.min(r0, r1), d = Math.max(r0, r1), out = [], x, y;
    var w = b - a + 1, h = d - c + 1;
    for (x = a; x <= b; x++) for (y = c; y <= d; y++) {
      var px = x + 0.5, py = y + 0.5, ok = true;
      if (kind === "circle") { var rx = w / 2, ry = h / 2, nx = (px - (a + rx)) / rx, ny = (py - (c + ry)) / ry; ok = nx * nx + ny * ny <= 1; }
      else if (kind === "triangle") { ok = pointInPoly(px, py, [[a + w / 2, c], [b + 1, d + 1], [a, d + 1]]); }
      if (ok) out.push([x, y]);
    }
    return out;
  }
  // Multi-point: clicking within `tol` px of the FIRST point (with 3+ points down) closes the shape.
  function closesPolygon(pts, p, tol) {
    if (!pts || pts.length < 3) return false;
    var dx = p.x - pts[0].x, dy = p.y - pts[0].y;
    return dx * dx + dy * dy <= tol * tol;
  }
  // Cells whose centre falls inside the polygon given in plan px (cell = `half` px square).
  function polygonCells(pts, half) {
    if (!pts || pts.length < 3) return [];
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var c0 = Math.floor(Math.min.apply(null, xs) / half), c1 = Math.floor(Math.max.apply(null, xs) / half);
    var r0 = Math.floor(Math.min.apply(null, ys) / half), r1 = Math.floor(Math.max.apply(null, ys) / half), out = [], poly = pts.map(function (p) { return [p.x, p.y]; });
    for (var c = c0; c <= c1; c++) for (var r = r0; r <= r1; r++) if (pointInPoly((c + 0.5) * half, (r + 0.5) * half, poly)) out.push([c, r]);
    return out;
  }

  // ---- select tool -------------------------------------------------------------------------------------
  // items = [{id, cells:["c,r"]}]; box = {c0,r0,c1,r1} (cell indices, any order). An item is hit when ANY of its
  // cells lies in the box (marquee-intersect, like every drawing tool).
  function boxSelect(items, box) {
    var a = Math.min(box.c0, box.c1), b = Math.max(box.c0, box.c1), c = Math.min(box.r0, box.r1), d = Math.max(box.r0, box.r1);
    return (items || []).filter(function (it) {
      return (it.cells || []).some(function (k) { var p = k.split(","), x = +p[0], y = +p[1]; return x >= a && x <= b && y >= c && y <= d; });
    });
  }
  function shiftKeys(keys, dc, dr) { return (keys || []).map(function (k) { var p = k.split(","); return (+p[0] + dc) + "," + (+p[1] + dr); }); }

  var api = { MODES: MODES, AREA_NAMES: AREA_NAMES, rectsOverlap: rectsOverlap, nameRect: nameRect, dimLabelPos: dimLabelPos,
    isNested: isNested, roomAtKey: roomAtKey, paintOrder: paintOrder, shapeCells: shapeCells, closesPolygon: closesPolygon,
    polygonCells: polygonCells, pointInPoly: pointInPoly, boxSelect: boxSelect, shiftKeys: shiftKeys };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.IOTDrawGeom = api;
})(typeof window !== "undefined" ? window : null);
