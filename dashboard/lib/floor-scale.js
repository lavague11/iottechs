// Real-world scale for the floor-plan Structure.
//
// The Structure lives in canvas pixels (a half-cell is HALF px, a full box is FULL px). When the
// structure is seeded from a satellite trace we know metersPerPx (real meters per canvas pixel) and
// every real-world size derives from it. Hand-drawn structures have no scale (metersPerPx = 0 →
// "unknown", and callers render nothing rather than a fake number).
export const M_PER_FT = 0.3048;

// Meters per canvas pixel, from the trace handoff: metersPerUnit (real metres per 1.0 of the
// normalized trace space) ÷ pxPerUnit (canvas px per that unit, i.e. the fit scale used to rasterise
// the outline onto the canvas).
export function metersPerPixel(metersPerUnit, pxPerUnit) {
  return (metersPerUnit > 0 && pxPerUnit > 0) ? metersPerUnit / pxPerUnit : 0;
}

// Canvas pixels → feet. Returns 0 when the scale is unknown.
export function pxToFeet(px, metersPerPx) {
  return (metersPerPx > 0) ? (px * metersPerPx) / M_PER_FT : 0;
}

// Square feet of N occupied half-cells, each halfPx × halfPx. 0 when the scale is unknown.
export function cellsToSqFt(cellCount, halfPx, metersPerPx) {
  const ftPerHalf = pxToFeet(halfPx, metersPerPx);
  return cellCount * ftPerHalf * ftPerHalf;
}
