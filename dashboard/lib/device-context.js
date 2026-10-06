// Device-context geometry — Phase 8.1. The ONE deterministic answer to "where is this device and
// what does its coverage hit", read from canonical Site Survey data. Pure: no DOM, no canvas, no AI.
// Phase 8.2 turns these facts into camera/speaker NAME suggestions; it must not re-derive the geometry.
//
// COORDINATE SPACES (see lib/survey2-model.js and lib/site-transform.js for the source shapes):
//   • Devices  — floor.devices[i] = { k, x, y, aim, fov, range, ring, cone, ... }. x,y are PERCENT
//     (0–100) of the plate (#scene). aim = heading in SCREEN degrees (x-right = 0°, y-down = +90°,
//     exactly `atan2(clientY-cy, clientX-cx)` as the planner records it). fov = cone angle (deg);
//     fov >= 360 or `ring` = omnidirectional. range = reach (FEET when the floor is scaled, else a
//     unitless fallback). The planner also exposes these via surveyDevices(); both shapes work here.
//   • Zones    — floor.zones = [{ id, label, type, pts:[[x,y]…] }], pts in plate-% — SAME space as
//     devices, so a device-in-zone test is a direct plate-% polygon test.
//   • Boundary — floor.boundary = { pts:[[x,y]…] } in plate-%.
//   • Rooms    — floor.plan.rooms = [{ cells:["c,r"…], label, semanticType }]. cells are HALF-cell
//     indices in PLAN-PX space (one half-cell = HALF_CELL_PX px). The plan is framed on the capture
//     viewport (floor.ctx.rect, fractions of the aerial) via floor.plan.seed = {sc,offx,offy,aspect}.
//   • North    — floor.aerial.northDeg = degrees CLOCKWISE from screen-up that north points (may be
//     absent on legacy/unscaled floors → true bearings degrade to positional).
//
// Everything here is null/empty-safe and degrades gracefully: when the floor lacks the capture
// transform (ctx/seed) room lookup returns null; when it lacks a real-world scale coverage returns [].

// One half-cell / full-cell in plan-px (mirrors HALF_PX=13 / FULL_PX=26 in lib/site-transform.js).
export const HALF_CELL_PX = 13;
export const FULL_CELL_PX = 26;
// Coverage reach (as % of plate) used on UNSCALED floors, where `range` has no real-world meaning —
// the planner itself draws a fixed ~14% fallback cone (surveyScene: minWH*0.14). Documented approximation.
export const FALLBACK_REACH_PCT = 14;

const DEG = Math.PI / 180;
const isNum = (v) => Number.isFinite(+v);
const num = (v, d = 0) => (isNum(v) ? +v : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm360 = (d) => ((d % 360) + 360) % 360;

// Normalize a point given as [x,y] or {x,y} → {x,y} numbers (null when not a finite pair).
function asPoint(p) {
  if (!p) return null;
  const x = Array.isArray(p) ? p[0] : p.x;
  const y = Array.isArray(p) ? p[1] : p.y;
  return isNum(x) && isNum(y) ? { x: +x, y: +y } : null;
}
// Normalize a polygon (array of [x,y]|{x,y}) → array of {x,y}; drops malformed vertices.
function asPoly(poly) {
  if (!Array.isArray(poly)) return [];
  const out = [];
  for (const p of poly) { const q = asPoint(p); if (q) out.push(q); }
  return out;
}

// ---- Basic polygon helpers -----------------------------------------------------------------------

// Ray-casting point-in-polygon. pt = [x,y]|{x,y}; poly = array of same. Edge/vertex cases are not
// guaranteed (fine for coverage/zone membership). Returns false for degenerate input.
export function pointInPolygon(pt, poly) {
  const p = asPoint(pt); const ring = asPoly(poly);
  if (!p || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const intersect = (a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Absolute area of a polygon (shoelace). 0 for degenerate input. Space-agnostic (plate-%² or px²).
export function polygonArea(poly) {
  const r = asPoly(poly);
  if (r.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x + r[i].x) * (r[j].y - r[i].y);
  return Math.abs(a / 2);
}

// Area-weighted centroid; falls back to the vertex average when the polygon is degenerate/zero-area.
export function polygonCentroid(poly) {
  const r = asPoly(poly);
  if (!r.length) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const cross = r[j].x * r[i].y - r[i].x * r[j].y;
    a += cross; cx += (r[j].x + r[i].x) * cross; cy += (r[j].y + r[i].y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    const s = r.reduce((o, p) => ({ x: o.x + p.x, y: o.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / r.length, y: s.y / r.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// ---- PLATE-% ↔ PLAN-PX ----------------------------------------------------------------------------
// The Phase-4 plan SVG is framed on the capture viewport: given ctx.rect (fractions of the aerial)
// and the plan seed {sc,offx,offy,aspect}, the plan's viewBox in plan-px is
//   ctxVB = { x0: rect.x*aspect*sc + offx, y0: rect.y*sc + offy, vw: rect.w*aspect*sc, vh: rect.h*sc }.
// A device at plate-% (px,py) therefore lands at plan-px (x0 + px/100*vw, y0 + py/100*vh).
// Returns null when ctx/seed are missing or degenerate (legacy/unscaled floor → room test unavailable).
export function ctxViewBox(ctx, seed) {
  const rect = ctx && ctx.rect;
  if (!rect || !seed) return null;
  const sc = num(seed.sc), aspect = num(seed.aspect), offx = num(seed.offx), offy = num(seed.offy);
  const rx = num(rect.x), ry = num(rect.y), rw = num(rect.w), rh = num(rect.h);
  if (!(sc > 0) || !(aspect > 0) || !(rw > 0) || !(rh > 0)) return null;
  const vw = rw * aspect * sc, vh = rh * sc;
  if (!(vw > 0) || !(vh > 0)) return null;
  return { x0: rx * aspect * sc + offx, y0: ry * sc + offy, vw, vh };
}

// PLATE-% → PLAN-PX. pct = [x,y]|{x,y} in 0–100. null when ctx/seed absent/degenerate.
export function plateToPlan(pct, ctx, seed) {
  const p = asPoint(pct); const vb = ctxViewBox(ctx, seed);
  if (!p || !vb) return null;
  return { x: vb.x0 + (p.x / 100) * vb.vw, y: vb.y0 + (p.y / 100) * vb.vh };
}

// PLAN-PX → PLATE-% (inverse of plateToPlan). null when ctx/seed absent/degenerate.
export function planToPlate(planPt, ctx, seed) {
  const p = asPoint(planPt); const vb = ctxViewBox(ctx, seed);
  if (!p || !vb) return null;
  return { x: ((p.x - vb.x0) / vb.vw) * 100, y: ((p.y - vb.y0) / vb.vh) * 100 };
}

// ---- Coverage geometry ---------------------------------------------------------------------------

// Convert a device's `range` to a reach in PLATE-% (of the plate's WIDTH).
//   scaled floor  → range feet ÷ plate real-world width feet × 100.
//   unscaled floor→ range has no real-world meaning; we use FALLBACK_REACH_PCT (the planner's fixed
//                   ~14% fallback), i.e. a crude px→% stand-in, since a pure fn has no plate pixels.
// APPROXIMATION: plate-% x and y are not the same number of feet unless the plate's px aspect equals
// its real-world aspect (ftW:ftH); we scale both axes by the WIDTH ratio, so a very non-square plate
// slightly distorts the wedge. Good enough for ranking zone overlap. Returns null when range <= 0,
// or when the floor claims to be scaled but no width is known (reach genuinely unknown).
export function rangeToPlatePct(device, scaleFeetW, plateIsScaled) {
  const range = num(device && device.range);
  if (!(range > 0)) return null;
  if (plateIsScaled) {
    const w = num(scaleFeetW);
    if (!(w > 0)) return null;
    return clamp((range / w) * 100, 0, 1000);
  }
  return FALLBACK_REACH_PCT;
}

// Is this device omnidirectional (speaker ring / 360° glassbreak) vs an aimed wedge?
function isRing(device) { return !!(device && (device.ring || num(device.fov, 0) >= 360)); }

// The device's coverage footprint as a polygon in PLATE-% (apex at x,y).
//   • aimed cone → [apex, arc(aim-fov/2 … aim+fov/2) at reach]  (steps arc segments)
//   • ring/360   → a closed circle of reach radius (no apex vertex)
// `opts` may be a number (= steps) or { steps=12, reachPct, scaleFeetW, plateIsScaled }. When reachPct
// is given it's used directly; otherwise it's derived via rangeToPlatePct. Returns null when the reach
// is unknown, or when a directional device has no usable fov (coverage test unavailable).
export function coneWedgePolygon(device, opts = {}) {
  if (!device) return null;
  const o = typeof opts === "number" ? { steps: opts } : (opts || {});
  const steps = Math.max(2, Math.round(num(o.steps, 12)));
  const cx = num(device.x), cy = num(device.y);
  if (!isNum(device.x) || !isNum(device.y)) return null;
  const reach = o.reachPct != null ? num(o.reachPct)
    : rangeToPlatePct(device, o.scaleFeetW, o.plateIsScaled);
  if (!(reach > 0)) return null;

  if (isRing(device)) {
    const n = Math.max(16, steps * 2), ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 * DEG;
      ring.push([cx + reach * Math.cos(a), cy + reach * Math.sin(a)]);
    }
    return ring;
  }
  const fov = clamp(num(device.fov, 0), 0, 359.9);
  if (!(fov > 0)) return null;               // directional device with no fov → shape unknown
  const aim = num(device.aim), half = fov / 2;
  const poly = [[cx, cy]];
  for (let i = 0; i <= steps; i++) {
    const a = (aim - half + (fov * i) / steps) * DEG;
    poly.push([cx + reach * Math.cos(a), cy + reach * Math.sin(a)]);
  }
  return poly;
}

// ---- Floor accessors (null-safe) -----------------------------------------------------------------
function floorZones(floor) { return (floor && Array.isArray(floor.zones)) ? floor.zones.filter((z) => z && Array.isArray(z.pts) && z.pts.length >= 3) : []; }
function devicePoint(device) { return (device && isNum(device.x) && isNum(device.y)) ? { x: +device.x, y: +device.y } : null; }
function floorScaleW(floor) { const s = floor && floor.scale; return (s && num(s.ftW) > 0) ? +s.ftW : 0; }
// The plate's real-world width in feet (0 = unscaled → coverage falls back).
function plateScale(floor) { const w = floorScaleW(floor); return { scaleFeetW: w, plateIsScaled: w > 0 }; }

// ---- Room / zone membership ----------------------------------------------------------------------

// The room whose occupied half-cell set contains the device's plan-px point, or null. Needs the
// floor's capture transform (ctx + plan.seed); without it (legacy/unscaled) returns null.
export function deviceRoom(device, floor) {
  const pt = devicePoint(device);
  const plan = floor && floor.plan;
  if (!pt || !plan || !Array.isArray(plan.rooms) || !plan.rooms.length) return null;
  const planPt = plateToPlan(pt, floor.ctx, plan.seed);
  if (!planPt) return null;
  const c = Math.floor(planPt.x / HALF_CELL_PX), r = Math.floor(planPt.y / HALF_CELL_PX);
  const key = c + "," + r;
  for (const room of plan.rooms) {
    if (room && Array.isArray(room.cells) && room.cells.indexOf(key) !== -1) return room;
  }
  return null;
}

// Zones whose polygon CONTAINS the device point (plate-%), in floor order. [] when none.
export function deviceZones(device, floor) {
  const pt = devicePoint(device);
  if (!pt) return [];
  return floorZones(floor).filter((z) => pointInPolygon(pt, z.pts));
}

// The closest zone by centroid distance (for when none contains the device). null when no zones.
export function nearestZone(device, floor) {
  const pt = devicePoint(device);
  const zones = floorZones(floor);
  if (!pt || !zones.length) return null;
  let best = null, bestD = Infinity;
  for (const z of zones) {
    const c = polygonCentroid(z.pts);
    if (!c) continue;
    const d = (c.x - pt.x) ** 2 + (c.y - pt.y) ** 2;
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

// For each zone, the APPROX fraction (0..1) of the device's coverage wedge that falls inside it,
// ranked descending. SAMPLING method: build the wedge polygon, lay a deterministic GRID_N×GRID_N grid
// over its bbox, keep the points inside the wedge (= the wedge's area in samples), then for each zone
// count how many of those also fall in the zone. overlap = inBoth / inWedge. Deterministic; zones that
// the wedge misses come back ~0. Returns [] when coverage is unknown (no reach / no fov / unscaled+no
// range) or there are no zones.
const GRID_N = 40;
export function coverageZones(device, floor) {
  const zones = floorZones(floor);
  if (!zones.length) return [];
  const { scaleFeetW, plateIsScaled } = plateScale(floor);
  const wedge = coneWedgePolygon(device, { scaleFeetW, plateIsScaled });
  if (!wedge) return [];
  const xs = wedge.map((p) => p[0]), ys = wedge.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;
  if (!(w > 0) || !(h > 0)) return [];
  const inside = [];                                   // sample points that lie within the wedge
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const sx = minX + ((i + 0.5) / GRID_N) * w, sy = minY + ((j + 0.5) / GRID_N) * h;
      if (pointInPolygon([sx, sy], wedge)) inside.push([sx, sy]);
    }
  }
  if (!inside.length) return [];
  const out = zones.map((z) => {
    let both = 0;
    for (const s of inside) if (pointInPolygon(s, z.pts)) both++;
    return { zone: z, overlap: both / inside.length };
  });
  out.sort((a, b) => b.overlap - a.overlap);
  return out;
}

// ---- Mounting side / facing ----------------------------------------------------------------------

// Resolve a floor's four side labels (top/right/bottom/left) the way the planner does: floor.sides
// overrides, else defaults Front/Right/Rear/Left. Returns { top, right, bottom, left } of labels.
const DEFAULT_SIDES = { top: "Front", right: "Right", bottom: "Rear", left: "Left" };
function sideLabels(floor) {
  const out = { ...DEFAULT_SIDES };
  const s = floor && floor.sides;
  if (s && typeof s === "object") {
    for (const k of ["top", "right", "bottom", "left"]) {
      const v = s[k];
      if (v && typeof v.label === "string" && v.label.trim()) out[k] = v.label.trim().slice(0, 24);
    }
  }
  return out;
}

// Which exterior side the device sits nearest. Compares the device point to the bounding box of the
// structure boundary (floor.boundary) when present, else the plate [0,100]². Returns the floor.sides
// label for that edge (Front/Right/Rear/Left by default). Also reports the raw positional edge.
export function mountedSide(device, floor) {
  const pt = devicePoint(device);
  if (!pt) return null;
  const bPts = asPoly(floor && floor.boundary && floor.boundary.pts);
  let minX = 0, minY = 0, maxX = 100, maxY = 100;
  if (bPts.length >= 3) {
    const xs = bPts.map((p) => p.x), ys = bPts.map((p) => p.y);
    minX = Math.min(...xs); maxX = Math.max(...xs); minY = Math.min(...ys); maxY = Math.max(...ys);
  }
  const dTop = pt.y - minY, dBottom = maxY - pt.y, dLeft = pt.x - minX, dRight = maxX - pt.x;
  const edges = [["top", dTop], ["right", dRight], ["bottom", dBottom], ["left", dLeft]];
  edges.sort((a, b) => a[1] - b[1]);
  const edge = edges[0][0];
  return { edge, label: sideLabels(floor)[edge] };
}

const SCREEN_8 = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"];
const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// Which way an aimed device points. Positional (screen) always; true compass bearing only when the
// floor recorded north (floor.aerial.northDeg). Returns null for un-aimed or omnidirectional devices.
//   bearing = aim + 90 - northDeg  (aim's screen-up is -90°; north sits northDeg clockwise from up).
export function facing(device, floor) {
  if (!device || isRing(device)) return null;
  const aimed = device.aimed === true || (isNum(device.aim) && +device.aim !== 0);
  if (!aimed) return null;
  const aim = num(device.aim);
  const toward = SCREEN_8[Math.round(norm360(aim) / 45) % 8];
  const north = floor && floor.aerial && isNum(floor.aerial.northDeg) ? +floor.aerial.northDeg : null;
  if (north == null) return { toward, bearing: null, compass: null };
  const bearing = norm360(aim + 90 - north);
  return { toward, bearing, compass: COMPASS_8[Math.round(bearing / 45) % 8] };
}

// ---- The one call Phase 8.2 consumes -------------------------------------------------------------

// Everything deterministic about a device's placement and what it covers, in one object:
//   { room, inZones, nearestZone, coverage:[{type,overlap}], side, facing }
// room/nearestZone null when unavailable; inZones/coverage empty when none. coverage lists only zones
// the wedge actually reaches (overlap > 0), ranked descending.
export function deviceContext(device, floor) {
  const inZones = deviceZones(device, floor);
  const cov = coverageZones(device, floor)
    .filter((c) => c.overlap > 0)
    .map((c) => ({ type: c.zone.type || c.zone.label || null, overlap: c.overlap }));
  return {
    room: deviceRoom(device, floor),
    inZones,
    nearestZone: inZones.length ? null : nearestZone(device, floor),
    coverage: cov,
    side: mountedSide(device, floor),
    facing: facing(device, floor),
  };
}
