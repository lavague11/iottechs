import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestPointOnSegment, polygonSegments, snapAnchor, markerAnchor } from "../lib/placement-snap.js";

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("nearestPointOnSegment: foot of perpendicular mid-segment", () => {
  const r = nearestPointOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(approx(r.x, 5) && approx(r.y, 0));
  assert.ok(approx(r.t, 0.5));
  assert.ok(approx(r.dist, 5));
});

test("nearestPointOnSegment: clamps past the endpoints", () => {
  const before = nearestPointOnSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(approx(before.x, 0) && approx(before.y, 0) && approx(before.t, 0));
  const after = nearestPointOnSegment({ x: 14, y: -3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(approx(after.x, 10) && approx(after.y, 0) && approx(after.t, 1));
});

test("nearestPointOnSegment: degenerate (zero-length) segment → its point, no NaN", () => {
  const r = nearestPointOnSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
  assert.ok(approx(r.x, 0) && approx(r.y, 0) && approx(r.t, 0));
  assert.ok(approx(r.dist, 5));
});

test("polygonSegments: closed ring adds the last→first edge; open does not", () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  assert.equal(polygonSegments(sq, "structure").length, 4);
  assert.equal(polygonSegments(sq, "structure", false).length, 3);
  assert.equal(polygonSegments([{ x: 0, y: 0 }], "x").length, 0);
  assert.equal(polygonSegments(sq, "boundary")[0].kind, "boundary");
});

test("snapAnchor: snaps to the nearest edge within tolerance, carrying its kind", () => {
  const segs = [
    ...polygonSegments([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], "structure"),
  ];
  const r = snapAnchor({ x: 50, y: 6 }, segs, 10); // 6px above the top edge
  assert.equal(r.snapped, true);
  assert.ok(approx(r.x, 50) && approx(r.y, 0));
  assert.equal(r.kind, "structure");
});

test("snapAnchor: restrained — beyond tolerance it does not snap (break-away)", () => {
  const segs = polygonSegments([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], "structure");
  const r = snapAnchor({ x: 50, y: 20 }, segs, 12); // 20px away > 12 tol
  assert.equal(r.snapped, false);
  assert.ok(approx(r.x, 50) && approx(r.y, 20)); // anchor passes through unchanged
  assert.equal(r.index, -1);
});

test("snapAnchor: picks the closest of several candidate segments", () => {
  const segs = [
    { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, kind: "boundary" }, // top, 9px away
    { a: { x: 0, y: 30 }, b: { x: 100, y: 30 }, kind: "wall" },   // 21px away
  ];
  const r = snapAnchor({ x: 40, y: 9 }, segs, 15);
  assert.equal(r.snapped, true);
  assert.equal(r.kind, "boundary");
  assert.ok(approx(r.y, 0));
});

test("snapAnchor: empty / missing segment list → no snap, no throw", () => {
  assert.equal(snapAnchor({ x: 1, y: 2 }, [], 10).snapped, false);
  assert.equal(snapAnchor({ x: 1, y: 2 }, null, 10).snapped, false);
});

test("markerAnchor: bottom-center by default; mount offset shifts it", () => {
  const box = { x: 10, y: 20, w: 40, h: 60 };
  const a = markerAnchor(box);
  assert.ok(approx(a.x, 30) && approx(a.y, 80)); // bottom-center
  const b = markerAnchor(box, { dx: 0.25, dy: -0.1 });
  assert.ok(approx(b.x, 40) && approx(b.y, 74));
});
