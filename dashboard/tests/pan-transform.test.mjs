import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { screenDragToPanBy } from "../lib/pan-transform.js";

const __dir = dirname(fileURLToPath(import.meta.url));

// Reconstruct the on-screen motion of the map CONTENT given a panBy result and the view rotation.
//   content moves opposite to the center: content_local = (-px, -py)
//   then CSS rotate(theta): content_screen = R(theta) * content_local,  R(θ)=[[c,-s],[s,c]]
// For the pan to be correct, content_screen must equal the finger delta at EVERY rotation.
function contentScreenMotion(rotDeg, pan) {
  const th = rotDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const lx = -pan.x, ly = -pan.y;
  return { x: c*lx - s*ly, y: s*lx + c*ly };
}

test("drag follows the finger on screen at every rotation (0/90/180/270 and between)", () => {
  const drags = [[100,0],[-100,0],[0,100],[0,-100],[60,-40],[-25,80]];
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315, -13, -90, 361]) {
    for (const [dx,dy] of drags) {
      const pan = screenDragToPanBy(deg, dx, dy);
      const m = contentScreenMotion(deg, pan);
      assert.ok(Math.hypot(m.x-dx, m.y-dy) < 1e-9,
        `rot ${deg}°, drag (${dx},${dy}) → content (${m.x.toFixed(3)},${m.y.toFixed(3)})`);
    }
  }
});

test("180°: up→up, down→down, left→left, right→right (the reported bug)", () => {
  // At 180° a naive implementation inverts both axes. Assert content tracks the finger.
  const up    = contentScreenMotion(180, screenDragToPanBy(180, 0, -100));
  const down  = contentScreenMotion(180, screenDragToPanBy(180, 0,  100));
  const left  = contentScreenMotion(180, screenDragToPanBy(180, -100, 0));
  const right = contentScreenMotion(180, screenDragToPanBy(180,  100, 0));
  assert.ok(up.y    < -1,  "drag up moves content up");
  assert.ok(down.y  >  1,  "drag down moves content down");
  assert.ok(left.x  < -1,  "drag left moves content left");
  assert.ok(right.x >  1,  "drag right moves content right");
});

test("0°: panBy is the plain inverse of the drag", () => {
  const p = screenDragToPanBy(0, 100, -40);
  assert.ok(Math.abs(p.x - (-100)) < 1e-9);
  assert.ok(Math.abs(p.y - ( 40)) < 1e-9);
});

// The widget is static HTML (no bundler) so it inlines the formula; guard against drift from the lib.
test("satellite-capture widget inlines the canonical pan formula", () => {
  const html = readFileSync(join(__dir, "..", "public", "widgets", "satellite-capture.html"), "utf8");
  assert.ok(html.includes("x: -(c*dx + s*dy), y: (s*dx - c*dy)"),
    "satellite-capture.html must inline the same screenDragToPanBy formula as lib/pan-transform.js");
});
