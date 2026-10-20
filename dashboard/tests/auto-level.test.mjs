// Auto-Level core — property-facing aerial orientation (pure math + detector).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AL = require("../public/widgets/auto-level.js");

const DEG = Math.PI / 180;
// road direction angle `dir`, rotated by `rot`, is horizontal when sin(rot+dir)≈0
const roadSlope = (rot, dir) => Math.abs(Math.sin((rot + dir) * DEG));

/* ----------------------------- norm / screenY ----------------------------- */
test("norm folds to (-180,180]; screenY sign tracks up/down after rotation", () => {
  assert.equal(AL.norm(190), -170);
  assert.equal(AL.norm(-190), 170);
  assert.equal(AL.norm(0), 0);
  // a vector pointing down (+y) is below (screenY>0) at 0°, above (screenY<0) after 180°
  assert.ok(AL.screenY(0, 0, 10) > 0);
  assert.ok(AL.screenY(180, 0, 10) < 0);
  // at +90° CW, +x maps downward (screenY>0)
  assert.ok(AL.screenY(90, 10, 0) > 0);
});

/* ----------------------- targetRotation: property-facing ------------------ */
test("targetRotation always lands the road horizontal with the property ABOVE it", () => {
  const roadPt = { x: 200, y: 300 };
  // sweep road directions and anchor positions on both sides of the line
  for (let dir = 0; dir < 180; dir += 7) {
    const nrm = { x: -Math.sin(dir * DEG), y: Math.cos(dir * DEG) }; // unit normal to the road
    for (const side of [-1, 1]) {
      const anchor = { x: roadPt.x + nrm.x * 60 * side, y: roadPt.y + nrm.y * 60 * side };
      const rot = AL.targetRotation(dir, roadPt, anchor);
      // road is horizontal after rotation
      assert.ok(roadSlope(rot, dir) < 1e-6, `road not horizontal at dir=${dir} side=${side}`);
      // property ends up above the road (screen-y of road->anchor is negative)
      const sy = AL.screenY(rot, anchor.x - roadPt.x, anchor.y - roadPt.y);
      assert.ok(sy < 1e-6, `property not above road at dir=${dir} side=${side} (sy=${sy})`);
    }
  }
});

test("req #5: a road already horizontal but ABOVE the property flips 180°", () => {
  const roadPt = { x: 100, y: 50 };            // road high in the frame
  const anchor = { x: 100, y: 300 };           // property below it
  const rot = AL.targetRotation(0, roadPt, anchor);
  assert.equal(Math.abs(AL.norm(rot)), 180);   // flipped
  assert.ok(AL.screenY(rot, 0, anchor.y - roadPt.y) < 0);  // now property above
});

test("already property-facing (road below, property above) needs no turn", () => {
  const rot = AL.targetRotation(0, { x: 100, y: 300 }, { x: 100, y: 60 });
  assert.equal(AL.norm(rot), 0);
});

/* --------------------------- synthetic detector --------------------------- */
// Build an ImageData-like raster: gray bg + a bright road line at `dir` through
// (px,py), optional short decoy stripes.
function raster(w, h, roads) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 120; data[i * 4 + 3] = 255; }
  const put = (x, y, v) => { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; };
  for (const r of roads) {
    const d = r.dir * DEG, dx = Math.cos(d), dy = Math.sin(d);
    const len = r.len != null ? r.len : Math.hypot(w, h);
    for (let t = -len / 2; t <= len / 2; t += 0.5) {
      for (let s = -(r.th || 3); s <= (r.th || 3); s += 0.5) {
        const nx = -Math.sin(d), ny = Math.cos(d);
        put(Math.round(r.px + dx * t + nx * s), Math.round(r.py + dy * t + ny * s), r.v != null ? r.v : 235);
      }
    }
  }
  return { data, width: w, height: h };
}

test("detector + analyze: a diagonal frontage road is turned horizontal with property above", () => {
  const w = 300, h = 300;
  // road at 30° across the lower part of the frame; anchor (property) above it
  const img = raster(w, h, [{ dir: 30, px: 150, py: 210, th: 3 }]);
  const anchor = { x: 150, y: 110 };
  const res = AL.analyze(img, anchor, { maxEdge: 300 });
  assert.ok(res.ok, "road found: " + JSON.stringify(res));
  // detected direction ≈ 30°
  const dAng = Math.min(Math.abs(res.angle - 30), 180 - Math.abs(res.angle - 30));
  assert.ok(dAng < 8, `angle off: ${res.angle}`);
  // Auto-Frame input: the perpendicular property->road distance (~100px here) comes back for the zoom math
  assert.ok(res.roadDistPx > 50 && res.roadDistPx < 160, `roadDistPx off: ${res.roadDistPx}`);
  // applying rotation makes the TRUE road horizontal …
  assert.ok(roadSlope(res.rotation, 30) < 0.12, `not horizontal: rot=${res.rotation}`);
  // … and the TRUE anchor above the TRUE road point
  assert.ok(AL.screenY(res.rotation, anchor.x - 150, anchor.y - 210) < 0, "anchor not above road");
});

test("detector flips when the road sits above the property", () => {
  const w = 300, h = 300;
  const img = raster(w, h, [{ dir: 0, px: 150, py: 80, th: 3 }]);  // horizontal road, high
  const anchor = { x: 150, y: 220 };                               // property below
  const res = AL.analyze(img, anchor, { maxEdge: 300 });
  assert.ok(res.ok, JSON.stringify(res));
  assert.ok(Math.abs(AL.norm(res.rotation)) > 150, `expected ~180 flip, got ${res.rotation}`);
});

test("ambiguous corner (two comparable streets at ~90°) → no guess", () => {
  const w = 300, h = 300;
  const img = raster(w, h, [
    { dir: 0, px: 150, py: 250, th: 3 },   // bottom street
    { dir: 90, px: 250, py: 150, th: 3 },  // right street, equally strong
  ]);
  const anchor = { x: 120, y: 120 };       // property in the inner corner
  const res = AL.analyze(img, anchor, { maxEdge: 300 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "ambiguous-frontage");
});

test("blank imagery → low confidence, no rotation", () => {
  const w = 200, h = 200;
  const img = { data: new Uint8ClampedArray(w * h * 4).fill(120), width: w, height: h };
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  const res = AL.analyze(img, { x: 100, y: 100 }, { maxEdge: 200 });
  assert.equal(res.ok, false);
});

/* --------------------------- widget wiring (drift) ------------------------ */
test("satellite-capture: loads the core, Auto button in #popLevel, applies via rotCoarse/applyRot/invalidateCapture, frames without cropping", () => {
  const sat = readFileSync(new URL("../public/widgets/satellite-capture.html", import.meta.url), "utf8");
  assert.ok(sat.includes('<script src="auto-level.js'), "loads the auto-level core before the inline script");
  const pop = sat.slice(sat.indexOf('id="popLevel"'), sat.indexOf('id="tLevel"'));
  assert.ok(pop.includes('id="tAuto"'), "the Auto button lives inside #popLevel (before #tLevel)");
  const fn = sat.slice(sat.indexOf("function autoLevel()"), sat.indexOf('$("tAuto").addEventListener'));
  assert.ok(fn.includes("window.IOTAutoLevel.analyze("), "analysis goes through the shared core");
  assert.ok(fn.includes("rotCoarse=norm(res.rotation)") && fn.includes('$("rot").value=0') && fn.includes("applyRot()") && fn.includes("invalidateCapture()"), "applies ONLY through the existing rotation path");
  assert.ok(fn.includes("marker.getPosition") && fn.includes("wx(P)") && fn.includes("wy(P)"), "uses the geocoded property marker as the side-of-road anchor");
  assert.ok(fn.includes('crossOrigin'), "CORS-clean Static-Maps fetch");
  assert.ok(fn.includes('maptype='), "fetches Static-Maps imagery (not the tainted live-map canvas)");
  assert.ok(fn.includes("ambiguous-frontage") && fn.includes("level manually"), "ambiguous/low-confidence → status, no silent rotation");
  // Auto-Frame: centers + zooms the property from the road distance, reusing the same analysis; no crop.
  assert.ok(fn.includes("autoFrame(res,"), "Auto-Level hands off to Auto-Frame after rotating");
  const af = sat.slice(sat.indexOf("function autoFrame("), sat.indexOf('$("tAuto").addEventListener'));
  assert.ok(af.includes("map.setCenter(P)") && af.includes("map.setZoom("), "Auto-Frame centers on the property and sets zoom");
  assert.ok(af.includes("res.roadDistPx"), "zoom derives from the frontage-road distance");
  assert.ok(/Math\.max\(16[\s\S]*Math\.min\(21/.test(af), "zoom is clamped to a sane range");
  assert.ok(!/\brect\s*=\s*\{/.test(sat.slice(sat.indexOf("function autoLevel()"), sat.indexOf("function ensureRect"))), "Auto still does NOT crop (no rect assignment)");
});
