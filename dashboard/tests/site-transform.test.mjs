import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FULL_PX, HALF_PX, M_PER_FT, norm, gridBoxFeet, makeTransform, siteToScreen, screenToSite,
  makePlate, imageToSite, siteToImage, percentToSite, siteToPercent, northArrowAngle } from "../lib/site-transform.js";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Site unit = one grid box; its physical size comes from the draw tool's metres-per-pixel.
test("gridBoxFeet: 26 px box × metersPerPx → feet; unscaled → 0, never a fake number", () => {
  assert.ok(close(gridBoxFeet(0.021), (26 * 0.021) / 0.3048));          // ≈ 1.79 ft
  assert.ok(close(gridBoxFeet(0.3048 / 26), 1));                          // a box that is exactly 1 ft
  assert.equal(gridBoxFeet(0), 0); assert.equal(gridBoxFeet(-1), 0); assert.equal(gridBoxFeet(undefined), 0);
  assert.equal(M_PER_FT, 0.3048); assert.equal(HALF_PX * 2, FULL_PX);
});

// The renderer constant must match the draw tool's grid, or every scale derived from it is wrong.
test("FULL_PX mirrors the draw tool's `var FULL=26` (drift guard)", () => {
  const html = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
  assert.ok(html.includes(`var FULL=${FULL_PX}, HALF=${HALF_PX};`), "draw-floorplan.html FULL/HALF changed — update lib/site-transform.js");
});

// Site ↔ screen must be an exact inverse pair at every rotation, including the leveling angles we use.
test("siteToScreen ∘ screenToSite is the identity at 0/90/180/270/-13/37° with scale + pan", () => {
  for (const deg of [0, 90, 180, 270, -13, 37, 361]) {
    const t = makeTransform({ scale: 26, rotationDeg: deg, offsetX: 118.5, offsetY: -40 });
    for (const [x, y] of [[0, 0], [10, 4], [-3.5, 7.25], [100, 100]]) {
      const s = siteToScreen(t, x, y), b = screenToSite(t, s.x, s.y);
      assert.ok(close(b.x, x) && close(b.y, y), `rot ${deg}: (${x},${y}) → (${b.x},${b.y})`);
    }
  }
});

// Rotation convention: CSS clockwise-positive with y down — same R(θ) as lib/pan-transform.js.
test("rotation is CSS clockwise: at +90° site +x points screen-DOWN", () => {
  const t = makeTransform({ scale: 1, rotationDeg: 90 });
  const p = siteToScreen(t, 1, 0);
  assert.ok(close(p.x, 0) && close(p.y, 1));
  const q = siteToScreen(makeTransform({ scale: 2, rotationDeg: 0, offsetX: 5, offsetY: 7 }), 3, 4);
  assert.ok(close(q.x, 11) && close(q.y, 15));
  assert.equal(makeTransform({ scale: 0 }).scale, 1, "a zero/negative scale falls back to 1");
});

// A plate declares the site rectangle it covers; image px and device PERCENT both map linearly onto it.
test("image/percent ↔ site round-trips on a plate, including a plate that doesn't start at the site origin", () => {
  const p = makePlate({ imgW: 1200, imgH: 800, widthBoxes: 60, heightBoxes: 40, siteX: 3, siteY: -2 });
  assert.ok(close(p.pxPerBoxX, 20) && close(p.pxPerBoxY, 20));
  const s = imageToSite(p, 200, 100);                 // 10 boxes right, 5 down from the plate's top-left
  assert.ok(close(s.x, 13) && close(s.y, 3));
  const i = siteToImage(p, s.x, s.y);
  assert.ok(close(i.x, 200) && close(i.y, 100));
  const d = percentToSite(p, 50, 50);                  // a device at the plate centre
  assert.ok(close(d.x, 3 + 30) && close(d.y, -2 + 20));
  const back = siteToPercent(p, d.x, d.y);
  assert.ok(close(back.x, 50) && close(back.y, 50));
  assert.throws(() => makePlate({ imgW: 0, imgH: 1, widthBoxes: 1, heightBoxes: 1 }));
});

// northDeg convention (satellite-capture): degrees CLOCKWISE from screen-up that north points.
// The plan is aligned to the leveled aerial, so the arrow rotates by exactly that (CSS clockwise).
test("northArrowAngle: after a -13° level the arrow turns 13° counter-clockwise; wraps like norm()", () => {
  assert.equal(northArrowAngle(-13), -13);
  assert.equal(northArrowAngle(13), 13);
  assert.equal(northArrowAngle(0), 0);
  assert.equal(northArrowAngle(193), -167);
  assert.equal(northArrowAngle(-13, 20), 7);          // extra plan rotation adds
  assert.equal(northArrowAngle(undefined), 0);
  assert.equal(norm(180), -180); assert.equal(norm(-180), -180); assert.equal(norm(540), -180);   // range is [-180, 180), matching the satellite's norm()
});
