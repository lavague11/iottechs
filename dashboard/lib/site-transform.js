// Site coordinate transforms — the ONE place that maps between the three spaces every survey tool
// uses, so no widget invents its own pointer math (Phase 3 of the site-model program).
//
//   SITE   — the canonical geometry space: grid BOXES, origin = the plan's cell (0,0), +x right, +y
//            down. Structure/rooms are stored in half-cells; a full box is the site unit. Physical
//            scale is metadata attached beside it (gridBoxFeet), never baked into the geometry.
//   IMAGE  — pixels of one specific raster/vector plate (the plan export, the context aerial…); a
//            plate declares which site rectangle it covers, so image px ↔ site boxes is linear.
//   SCREEN — CSS pixels of a viewer: site scaled (px per box), optionally rotated, then offset (pan).
//
// Conventions (pinned by tests/site-transform.test.mjs; the widgets inline identical copies and a
// drift test keeps them equal):
//   • rotationDeg is CSS-style: positive = CLOCKWISE on screen (y down). R(θ)=[[c,-s],[s,c]].
//   • northDeg (from satellite-capture's `aerial.northDeg`) = how many degrees CLOCKWISE from
//     screen-up north points. The plan is captured aligned to the leveled aerial, so a north arrow
//     drawn pointing "up" is rotated by exactly northDeg (+ any extra plan rotation).
//   • 1 box = FULL_PX draw-tool pixels = gridBoxFeet(metersPerPx) feet.

export const FULL_PX = 26;            // draw-tool render px per grid box — mirrors `var FULL=26` in draw-floorplan.html
export const HALF_PX = 13;
export const M_PER_FT = 0.3048;

export function norm(deg) { return ((deg + 180) % 360 + 360) % 360 - 180; }   // → [-180, 180)  (same formula as satellite-capture's norm())

// Physical scale of one grid box, from the draw tool's calibrated metres-per-canvas-pixel.
// 0 means "unscaled" (hand-drawn / uploaded) — callers render nothing rather than a fake number.
export function gridBoxFeet(metersPerPx, fullPx = FULL_PX) {
  return metersPerPx > 0 ? (fullPx * metersPerPx) / M_PER_FT : 0;
}

// ---- SITE ↔ SCREEN (similarity transform: scale → rotate → translate) ----------------------------
export function makeTransform({ scale = 1, rotationDeg = 0, offsetX = 0, offsetY = 0 } = {}) {
  const th = (rotationDeg || 0) * Math.PI / 180;
  return { scale: scale > 0 ? scale : 1, rotationDeg: norm(rotationDeg || 0), offsetX, offsetY, cos: Math.cos(th), sin: Math.sin(th) };
}
export function siteToScreen(t, x, y) {
  const sx = x * t.scale, sy = y * t.scale;
  return { x: t.cos * sx - t.sin * sy + t.offsetX, y: t.sin * sx + t.cos * sy + t.offsetY };
}
export function screenToSite(t, px, py) {
  const dx = px - t.offsetX, dy = py - t.offsetY;
  const sx = t.cos * dx + t.sin * dy, sy = -t.sin * dx + t.cos * dy;   // R(-θ)
  return { x: sx / t.scale, y: sy / t.scale };
}

// ---- IMAGE ↔ SITE (a plate covers a site rectangle; pixels map linearly) --------------------------
// widthBoxes/heightBoxes = how many grid boxes the plate spans; siteX/siteY = site coords of its top-left.
export function makePlate({ imgW, imgH, widthBoxes, heightBoxes, siteX = 0, siteY = 0 }) {
  if (!(imgW > 0 && imgH > 0 && widthBoxes > 0 && heightBoxes > 0)) throw new Error("makePlate: all dimensions must be > 0");
  return { imgW, imgH, widthBoxes, heightBoxes, siteX, siteY, pxPerBoxX: imgW / widthBoxes, pxPerBoxY: imgH / heightBoxes };
}
export function imageToSite(p, ix, iy) { return { x: p.siteX + ix / p.pxPerBoxX, y: p.siteY + iy / p.pxPerBoxY }; }
export function siteToImage(p, x, y) { return { x: (x - p.siteX) * p.pxPerBoxX, y: (y - p.siteY) * p.pxPerBoxY }; }
// Devices are stored as PERCENT of their plate — the same linear map, scaled by 100.
export function percentToSite(p, px, py) { return imageToSite(p, px / 100 * p.imgW, py / 100 * p.imgH); }
export function siteToPercent(p, x, y) { const i = siteToImage(p, x, y); return { x: i.x / p.imgW * 100, y: i.y / p.imgH * 100 }; }

// ---- NORTH -------------------------------------------------------------------------------------
// CSS rotation (clockwise-positive) to apply to an arrow drawn pointing UP so it points true north.
export function northArrowAngle(aerialNorthDeg, planRotationDeg = 0) {
  return norm((+aerialNorthDeg || 0) + (+planRotationDeg || 0));
}
