// Phase 3c (grid-first): migrate the legacy polygon boundary + zones (survey plate-% coords) into the
// draw tool's HALF-cell grid, so every zone ends at ONE representation — grid cells. Pure geometry, like
// lib/placement-snap.js; the draw tool inlines an identical copy behind a drift-guard test. Reuses the
// tested ray-cast point-in-polygon from device-context.js.
import { pointInPolygon } from "./device-context.js";

// Plate-% polygon (0..100 of the ctx plate) → plan-px, via the ctx viewBox {x0,y0,vw,vh}
// (= planViewBox / ctxVB): a plate fraction maps to x0 + fraction*vw. Accepts [x,y] or {x,y} vertices.
export function pctToPlanPx(pts, vb) {
  return (pts || []).map((p) => {
    const px = Array.isArray(p) ? +p[0] : +p.x, py = Array.isArray(p) ? +p[1] : +p.y;
    return [vb.x0 + (px / 100) * vb.vw, vb.y0 + (py / 100) * vb.vh];
  });
}

// Rasterize a plate-% polygon into HALF-cell keys ("c,r") whose CENTRE lies inside it. [] for a
// degenerate polygon or a missing/zero viewBox; capped so a bad input can't run away.
export function polygonToCells(ptsPct, vb, half, cap = 20000) {
  if (!vb || !(+vb.vw > 0) || !(+vb.vh > 0) || !ptsPct || ptsPct.length < 3) return [];
  const poly = pctToPlanPx(ptsPct, vb);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const c0 = Math.floor(minX / half), c1 = Math.ceil(maxX / half), r0 = Math.floor(minY / half), r1 = Math.ceil(maxY / half);
  const out = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (out.length >= cap) return out;
    if (pointInPolygon([c * half + half / 2, r * half + half / 2], poly)) out.push(c + "," + r);
  }
  return out;
}

// Migrate a floor's polygon boundary + typed zones (plate-%) → a zoneCells map { type -> ["c,r"] }.
// boundary → "site" (the base layer); each typed zone → its type; ONE class per cell, later layers win
// (zones paint over the site base), matching the draw tool's one-class-per-cell paint.
export function polygonsToZoneCells(boundary, zones, vb, half) {
  const owner = new Map();
  const paint = (pts, type) => { polygonToCells(pts, vb, half).forEach((k) => owner.set(k, type)); };
  if (boundary && boundary.pts) paint(boundary.pts, "site");
  (zones || []).forEach((z) => { if (z && z.pts && z.type) paint(z.pts, z.type); });
  const out = {};
  for (const [k, t] of owner) (out[t] = out[t] || []).push(k);
  return out;
}
