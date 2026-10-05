// Screen-space drag → Google Maps panBy, corrected for the satellite editor's view rotation.
//
// The interactive aerial is CSS-rotated for leveling (#mapRot), and Google pans inside that rotated
// container, so a raw drag moves the map along the ROTATED axes — at 180° "up" becomes "down", etc.
// This converts a SCREEN-space pointer delta (dx,dy; right/down positive) into the panBy(px,py) that
// makes the map CONTENT follow the finger on screen at ANY rotation.
//
// Derivation (screen y points down; CSS rotate(θ) is R(θ)=[[cosθ,-sinθ],[sinθ,cosθ]]):
//   map content is rendered in map-local space, then CSS-rotated → content_screen = R(θ)·content_local.
//   panBy(px,py) shifts the center by (px,py) px, i.e. content_local by (-px,-py).
//   We need content_screen = (dx,dy): R(θ)·(-px,-py) = (dx,dy)
//   → (-px,-py) = R(-θ)·(dx,dy) → px = -(cosθ·dx + sinθ·dy), py = sinθ·dx - cosθ·dy.
//
// Translation stays in screen space; rotation stays in image space. No angle-specific hacks — one
// formula valid at 0/90/180/270 and every angle in between, forward and reverse.
export function screenDragToPanBy(rotDeg, dx, dy) {
  const th = (rotDeg || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  return { x: -(c*dx + s*dy), y: (s*dx - c*dy) };
}
