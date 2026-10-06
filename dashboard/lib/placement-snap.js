// Precision device-placement geometry (pure). The one source for the drag-time snap + canonical
// anchor used by the Site Survey planner's loupe placement. Kept as a pure lib (like
// lib/site-transform.js) so the widget inlines an identical copy behind a drift-guard test and the
// math is unit-tested here, away from the DOM.
//
// Coordinate spaces: every function is space-agnostic — it operates in whatever units the caller
// passes. For snapping the caller works in SCREEN PIXELS (so the tolerance is a real on-screen
// distance, per the spec's 8–14px), then maps the returned point back to the device's stored
// percent-of-scene coordinate. markerAnchor is the only DOM-shaped helper (a marker box → its
// canonical mount point) and is likewise pure.

// Nearest point to p on the segment a→b, clamped to the segment (not the infinite line).
// Returns the point, the parameter t in [0,1], and the distance from p.
export function nearestPointOnSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0; // degenerate segment → its point a
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const x = a.x + t * abx, y = a.y + t * aby;
  const dx = p.x - x, dy = p.y - y;
  return { x, y, t, dist: Math.sqrt(dx * dx + dy * dy) };
}

// Expand a ring of vertices (a closed polygon: Structure outline, room, site boundary) into its
// edge segments. `pts` is [{x,y}, …]; `closed` (default true) adds the last→first edge. `kind` is a
// free label carried onto each segment so the caller can emphasise the matched geometry.
export function polygonSegments(pts, kind, closed = true) {
  const out = [];
  if (!pts || pts.length < 2) return out;
  for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], kind: kind || null });
  if (closed && pts.length >= 3) out.push({ a: pts[pts.length - 1], b: pts[0], kind: kind || null });
  return out;
}

// Snap an anchor to the nearest segment within `tolerancePx`. `segments` is [{a,b,kind?}] in the
// SAME space as `anchor`. Restrained by design: beyond the tolerance nothing snaps (snapped:false),
// so the user breaks away just by moving off the edge — placement never feels sticky from afar.
export function snapAnchor(anchor, segments, tolerancePx) {
  let best = null;
  for (let i = 0; i < (segments ? segments.length : 0); i++) {
    const s = segments[i];
    if (!s || !s.a || !s.b) continue;
    const np = nearestPointOnSegment(anchor, s.a, s.b);
    if (np.dist <= tolerancePx && (!best || np.dist < best.dist)) {
      best = { x: np.x, y: np.y, t: np.t, dist: np.dist, index: i, kind: s.kind || null };
    }
  }
  if (!best) return { x: anchor.x, y: anchor.y, snapped: false, index: -1, kind: null, t: 0, dist: Infinity };
  return { x: best.x, y: best.y, snapped: true, index: best.index, kind: best.kind, t: best.t, dist: best.dist };
}

// Canonical placement anchor for a marker box {x,y,w,h} (top-left origin). Cameras/devices mount at
// bottom-center, so the saved coordinate tracks the mount point, not the icon's bbox centre — the
// loupe crosshair sits exactly here and the icon's size never offsets placement. An optional mount
// {dx,dy} (fractions of w/h from bottom-center) supports a device with an explicit mount hotspot.
export function markerAnchor(box, mount) {
  const dx = mount && typeof mount.dx === "number" ? mount.dx : 0;
  const dy = mount && typeof mount.dy === "number" ? mount.dy : 0;
  return { x: box.x + box.w * (0.5 + dx), y: box.y + box.h * (1 + dy) };
}
