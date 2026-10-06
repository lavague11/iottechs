import test from "node:test";
import assert from "node:assert/strict";
import {
  pointInPolygon, polygonArea, polygonCentroid,
  ctxViewBox, plateToPlan, planToPlate, rangeToPlatePct, coneWedgePolygon,
  deviceRoom, deviceZones, nearestZone, coverageZones, mountedSide, facing, deviceContext,
  HALF_CELL_PX, FALLBACK_REACH_PCT,
} from "../lib/device-context.js";

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

// ---- basic polygon helpers ----------------------------------------------------------------------
test("pointInPolygon: inside / outside / degenerate", () => {
  assert.equal(pointInPolygon([5, 5], SQUARE), true);
  assert.equal(pointInPolygon({ x: 5, y: 5 }, SQUARE), true);
  assert.equal(pointInPolygon([15, 5], SQUARE), false);
  assert.equal(pointInPolygon([5, 5], [[0, 0], [10, 0]]), false);   // < 3 pts
  assert.equal(pointInPolygon(null, SQUARE), false);
});

test("polygonArea + polygonCentroid", () => {
  assert.ok(close(polygonArea(SQUARE), 100));
  assert.equal(polygonArea([[0, 0], [1, 1]]), 0);
  const c = polygonCentroid(SQUARE);
  assert.ok(close(c.x, 5) && close(c.y, 5));
  const deg = polygonCentroid([[2, 2], [4, 2]]);          // zero area → vertex average
  assert.ok(close(deg.x, 3) && close(deg.y, 2));
  assert.equal(polygonCentroid([]), null);
});

// ---- plate ↔ plan --------------------------------------------------------------------------------
const CTX = { rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } };
const SEED = { sc: 1000, offx: 30, offy: 40, aspect: 1.5 };

test("ctxViewBox matches the documented framing formula", () => {
  const vb = ctxViewBox(CTX, SEED);
  assert.ok(close(vb.x0, 0.1 * 1.5 * 1000 + 30));   // 180
  assert.ok(close(vb.y0, 0.2 * 1000 + 40));         // 240
  assert.ok(close(vb.vw, 0.5 * 1.5 * 1000));        // 750
  assert.ok(close(vb.vh, 0.4 * 1000));              // 400
});

test("plateToPlan ∘ planToPlate round-trips; null without ctx/seed", () => {
  const pct = { x: 40, y: 60 };
  const plan = plateToPlan(pct, CTX, SEED);
  assert.ok(close(plan.x, 180 + 0.4 * 750) && close(plan.y, 240 + 0.6 * 400));
  const back = planToPlate(plan, CTX, SEED);
  assert.ok(close(back.x, 40) && close(back.y, 60));
  assert.equal(plateToPlan(pct, null, SEED), null);
  assert.equal(plateToPlan(pct, CTX, null), null);
  assert.equal(plateToPlan(pct, { rect: { x: 0, y: 0, w: 0, h: 0 } }, SEED), null);
});

// ---- range → % and cone wedge --------------------------------------------------------------------
test("rangeToPlatePct: scaled feet→%, unscaled fallback, unknown→null", () => {
  assert.ok(close(rangeToPlatePct({ range: 40 }, 80, true), 50));   // 40ft of an 80ft plate
  assert.equal(rangeToPlatePct({ range: 18 }, 0, false), FALLBACK_REACH_PCT);
  assert.equal(rangeToPlatePct({ range: 0 }, 80, true), null);
  assert.equal(rangeToPlatePct({ range: 40 }, 0, true), null);       // scaled but no width
});

test("coneWedgePolygon: apex + arc for a wedge, ring for 360, null when reach unknown", () => {
  const wedge = coneWedgePolygon({ x: 50, y: 50, aim: 0, fov: 90, range: 20 }, { reachPct: 20, steps: 8 });
  assert.equal(wedge.length, 1 + 9);                 // apex + (steps+1) arc points
  assert.ok(close(wedge[0][0], 50) && close(wedge[0][1], 50));   // apex at device
  // aim 0 = +x (screen right); arc spans -45°..+45°, so all arc points have x > apex
  assert.ok(wedge.slice(1).every((p) => p[0] > 50));
  const ring = coneWedgePolygon({ x: 50, y: 50, ring: true, range: 10 }, { reachPct: 10 });
  assert.ok(ring.length >= 16);
  assert.ok(ring.every((p) => close(Math.hypot(p[0] - 50, p[1] - 50), 10)));   // all on the circle
  assert.equal(coneWedgePolygon({ x: 50, y: 50, fov: 90 }, {}), null);          // no reach
  assert.equal(coneWedgePolygon({ x: 1, y: 1, range: 5, fov: 0 }, { reachPct: 5 }), null); // no fov
});

// ---- zones ---------------------------------------------------------------------------------------
const DRIVEWAY = { id: "z1", label: "Driveway", type: "driveway", pts: [[60, 40], [90, 40], [90, 60], [60, 60]] };
const YARD = { id: "z2", label: "Backyard", type: "backyard", pts: [[10, 10], [30, 10], [30, 30], [10, 30]] };
const FLOOR_ZONES = { zones: [DRIVEWAY, YARD] };

test("deviceZones: containment in floor order; empty when none", () => {
  const inside = deviceZones({ x: 75, y: 50 }, FLOOR_ZONES);
  assert.equal(inside.length, 1);
  assert.equal(inside[0].id, "z1");
  assert.equal(deviceZones({ x: 50, y: 50 }, FLOOR_ZONES).length, 0);
  assert.equal(deviceZones({ x: 50, y: 50 }, {}).length, 0);
});

test("nearestZone: closest centroid when none contains", () => {
  const z = nearestZone({ x: 50, y: 50 }, FLOOR_ZONES);
  assert.equal(z.id, "z1");                           // driveway centroid (75,50) is closer than yard (20,20)
  assert.equal(nearestZone({ x: 0, y: 0 }, FLOOR_ZONES).id, "z2");
  assert.equal(nearestZone({ x: 0, y: 0 }, {}), null);
});

test("coverageZones: aimed at a zone ranks it first; aimed away ranks ~0", () => {
  // camera at (50,50), scaled plate 100ft wide, range 40ft → reach 40%. Aim 0 = toward the driveway (to the right).
  const cam = { x: 50, y: 50, aim: 0, fov: 60, range: 40 };
  const floor = { zones: [YARD, DRIVEWAY], scale: { ftW: 100, ftH: 100 } };
  const ranked = coverageZones(cam, floor);
  assert.equal(ranked[0].zone.id, "z1");              // driveway first
  assert.ok(ranked[0].overlap > 0.1);
  const away = coverageZones({ ...cam, aim: 180 }, floor);   // now pointing left, away from driveway
  const dw = away.find((r) => r.zone.id === "z1");
  assert.ok(dw.overlap < 0.01);
  assert.equal(coverageZones(cam, { zones: [] }).length, 0);
  assert.equal(coverageZones({ x: 50, y: 50, fov: 60 }, floor).length, 0);   // no range on a scaled floor → unknown
});

// ---- rooms ---------------------------------------------------------------------------------------
test("deviceRoom: plan-px half-cell containment; null without ctx/plan", () => {
  // A plan where cells (0,0) and (1,0) belong to a room. plateToPlan with this ctx/seed must land there.
  const ctx = { rect: { x: 0, y: 0, w: 1, h: 1 } };
  const seed = { sc: HALF_CELL_PX * 4, offx: 0, offy: 0, aspect: 1 }; // vw=vh=52px → 4 half-cells across
  const plan = { seed, rooms: [{ label: "Lobby", semanticType: "lobby", cells: ["0,0", "1,0", "0,1"] }] };
  const floor = { ctx, plan };
  // plate 10%,10% → plan (5.2,5.2)px → half-cell (0,0) → Lobby
  assert.equal(deviceRoom({ x: 10, y: 10 }, floor).label, "Lobby");
  // plate 95%,95% → plan (~49,49)px → half-cell (3,3) → not in room
  assert.equal(deviceRoom({ x: 95, y: 95 }, floor), null);
  assert.equal(deviceRoom({ x: 10, y: 10 }, { plan: { rooms: [] } }), null);  // no ctx/seed
});

// ---- mounted side --------------------------------------------------------------------------------
test("mountedSide: four edges, floor.sides labels override defaults", () => {
  assert.equal(mountedSide({ x: 50, y: 2 }, {}).edge, "top");
  assert.equal(mountedSide({ x: 50, y: 2 }, {}).label, "Front");
  assert.equal(mountedSide({ x: 98, y: 50 }, {}).edge, "right");
  assert.equal(mountedSide({ x: 50, y: 98 }, {}).edge, "bottom");
  assert.equal(mountedSide({ x: 2, y: 50 }, {}).edge, "left");
  const withSides = { sides: { bottom: { label: "Loading Dock", type: "loading" } } };
  assert.equal(mountedSide({ x: 50, y: 98 }, withSides).label, "Loading Dock");
});

// ---- facing --------------------------------------------------------------------------------------
test("facing: positional always, compass bearing when north is known, null for ring/un-aimed", () => {
  assert.equal(facing({ aim: 0, fov: 60, aimed: true }, {}).toward, "right");
  assert.equal(facing({ aim: -90, fov: 60, aimed: true }, {}).toward, "up");
  assert.equal(facing({ aim: 90, fov: 60, aimed: true }, {}).toward, "down");
  // north up (northDeg 0): aim -90 (screen up) → bearing 0 → N
  const f = facing({ aim: -90, fov: 60, aimed: true }, { aerial: { northDeg: 0 } });
  assert.ok(close(f.bearing, 0) && f.compass === "N");
  // north to screen-right (northDeg 90): aim -90 (up) → bearing 270 → W
  const f2 = facing({ aim: -90, fov: 60, aimed: true }, { aerial: { northDeg: 90 } });
  assert.ok(close(f2.bearing, 270) && f2.compass === "W");
  assert.equal(facing({ ring: true, aimed: true }, {}), null);
  assert.equal(facing({ aim: 0, fov: 60, aimed: false }, {}), null);
});

// ---- integration ---------------------------------------------------------------------------------
test("deviceContext: combined summary on a synthetic floor", () => {
  const ctx = { rect: { x: 0, y: 0, w: 1, h: 1 } };
  const seed = { sc: HALF_CELL_PX * 10, offx: 0, offy: 0, aspect: 1 };   // 10 half-cells across
  const floor = {
    ctx,
    scale: { ftW: 100, ftH: 100 },
    aerial: { northDeg: 0 },
    sides: { right: { label: "Parking", type: "parking" } },
    zones: [DRIVEWAY, YARD],
    boundary: { pts: [[0, 0], [100, 0], [100, 100], [0, 100]] },
    plan: { seed, rooms: [{ label: "Showroom", semanticType: "showroom", cells: ["7,4", "7,5", "8,4", "8,5"] }] },
  };
  // device at 75%,50%: inside driveway; plan (75,50)px → half-cell (5,3)... place it in the room cell instead
  const cam = { x: 75, y: 45, aim: 0, fov: 60, range: 30, aimed: true };
  const cxt = deviceContext(cam, floor);
  assert.equal(cxt.inZones[0].id, "z1");             // in the driveway
  assert.equal(cxt.nearestZone, null);               // inside a zone → nearest omitted
  assert.ok(cxt.coverage.length >= 1 && cxt.coverage[0].overlap > 0);
  assert.equal(cxt.side.edge, "right");              // x=75 is 25 from the right edge, nearer than any other
  assert.equal(cxt.side.label, "Parking");           // floor.sides override for the right edge
  assert.equal(cxt.facing.compass, "E");             // aim 0 + north up → East
  // plan point of (75,45): x=0.75*130=97.5px→cell7, y=0.45*130=58.5px→cell4 → "7,4" → Showroom
  assert.equal(cxt.room.label, "Showroom");
});
