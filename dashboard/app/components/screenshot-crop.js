// Crop geometry for the bug-reporter screenshot editor. Pure: no DOM, no React — the annotator owns the
// canvas and history, this module owns the maths so it can be tested under bare Node.
// All coordinates are the image's NATURAL pixels (the same space the annotation shapes live in).

export const MIN_CROP = 24;
const HANDLE_NAMES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Normalise a box that may have negative w/h and clamp it inside the W×H image; never smaller than `min`.
export function clampBox(box, W, H, min = MIN_CROP) {
  // Clip the corners to the image FIRST (a drag that leaves the canvas must clip, not shift), then grow
  // to the minimum size from the anchored edge.
  let x0 = clamp(Math.min(box.x, box.x + box.w), 0, W), x1 = clamp(Math.max(box.x, box.x + box.w), 0, W);
  let y0 = clamp(Math.min(box.y, box.y + box.h), 0, H), y1 = clamp(Math.max(box.y, box.y + box.h), 0, H);
  const mw = Math.min(min, W), mh = Math.min(min, H);
  if (x1 - x0 < mw) { x1 = Math.min(W, x0 + mw); x0 = x1 - mw; }
  if (y1 - y0 < mh) { y1 = Math.min(H, y0 + mh); y0 = y1 - mh; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// The box a freshly opened Crop tool starts with: the image, inset a little so the dim + handles read.
export function initialBox(W, H, inset = 0.06) {
  const dx = Math.round(W * inset), dy = Math.round(H * inset);
  return clampBox({ x: dx, y: dy, w: W - dx * 2, h: H - dy * 2 }, W, H);
}

// Whole-pixel box (a canvas crop must land on integer pixels).
export function roundBox(box, W, H) {
  const x = clamp(Math.round(box.x), 0, W - 1), y = clamp(Math.round(box.y), 0, H - 1);
  return { x, y, w: clamp(Math.round(box.w), 1, W - x), h: clamp(Math.round(box.h), 1, H - y) };
}

export const isFullBox = (box, W, H) => box.x <= 0 && box.y <= 0 && box.w >= W && box.h >= H;

// Which handle (or the body) is under point p. tol = grab radius in natural px.
export function hitHandle(box, p, tol) {
  const { x, y, w, h } = box;
  const pts = { nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2],
    se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2] };
  // nearest handle within reach wins (on a small box several overlap; list order must not decide)
  let best = null, bestD = Infinity;
  for (const name of HANDLE_NAMES) {
    const [hx, hy] = pts[name];
    if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) {
      const d = Math.hypot(p.x - hx, p.y - hy);
      if (d < bestD) { best = name; bestD = d; }
    }
  }
  if (best) return best;
  // edges (between handles) resize on one axis
  const inX = p.x >= x && p.x <= x + w, inY = p.y >= y && p.y <= y + h;
  if (inX && Math.abs(p.y - y) <= tol) return "n";
  if (inX && Math.abs(p.y - (y + h)) <= tol) return "s";
  if (inY && Math.abs(p.x - x) <= tol) return "w";
  if (inY && Math.abs(p.x - (x + w)) <= tol) return "e";
  if (inX && inY) return "move";
  return null;
}

// New box after dragging `mode` from p0 to p, starting from box0. "new" draws a fresh box corner-to-corner.
export function dragBox(mode, box0, p0, p, W, H, min = MIN_CROP) {
  if (mode === "new") return clampBox({ x: p0.x, y: p0.y, w: p.x - p0.x, h: p.y - p0.y }, W, H, min);
  const dx = p.x - p0.x, dy = p.y - p0.y;
  if (mode === "move") {
    return { ...box0, x: clamp(box0.x + dx, 0, W - box0.w), y: clamp(box0.y + dy, 0, H - box0.h) };
  }
  let l = box0.x, t = box0.y, r = box0.x + box0.w, b = box0.y + box0.h;
  if (mode.includes("w")) l = clamp(l + dx, 0, r - min);
  if (mode.includes("e")) r = clamp(r + dx, l + min, W);
  if (mode.includes("n")) t = clamp(t + dy, 0, b - min);
  if (mode.includes("s")) b = clamp(b + dy, t + min, H);
  return { x: l, y: t, w: r - l, h: b - t };
}

// ---- annotations ----
// Approximate extent of a shape (text uses its font size; same 1.22 line-height the canvas draws with).
export function shapeBounds(s) {
  if (s.type === "rect") {
    return { x0: Math.min(s.x, s.x + s.w), y0: Math.min(s.y, s.y + s.h), x1: Math.max(s.x, s.x + s.w), y1: Math.max(s.y, s.y + s.h) };
  }
  if (s.type === "arrow") {
    return { x0: Math.min(s.from.x, s.to.x), y0: Math.min(s.from.y, s.to.y), x1: Math.max(s.from.x, s.to.x), y1: Math.max(s.from.y, s.to.y) };
  }
  if (s.type === "pen") {
    const xs = s.points.map((q) => q.x), ys = s.points.map((q) => q.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  const lines = String(s.text || "").split("\n");
  const w = Math.max(...lines.map((l) => l.length), 1) * s.size * 0.6;
  return { x0: s.x, y0: s.y, x1: s.x + w, y1: s.y + lines.length * s.size * 1.22 };
}

export function translateShape(s, dx, dy) {
  if (s.type === "rect" || s.type === "text") return { ...s, x: s.x + dx, y: s.y + dy };
  if (s.type === "arrow") return { ...s, from: { x: s.from.x + dx, y: s.from.y + dy }, to: { x: s.to.x + dx, y: s.to.y + dy } };
  if (s.type === "pen") return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
  return s;
}

// Shapes after cropping to `box`: shapes entirely outside are dropped, the rest move by -box.x/-box.y.
export function cropShapes(shapes, box) {
  const out = [];
  for (const s of shapes) {
    const b = shapeBounds(s);
    const outside = b.x1 < box.x || b.x0 > box.x + box.w || b.y1 < box.y || b.y0 > box.y + box.h;
    if (!outside) out.push(translateShape(s, -box.x, -box.y));
  }
  return out;
}

// ---- view ----
// Zoom-to-fit: the display size that fills availW×availH with a w×h image, aspect preserved. Upscales a
// small crop (that is the point — a cropped region should fill the canvas).
export function fitSize(w, h, availW, availH) {
  if (!(w > 0 && h > 0 && availW > 0 && availH > 0)) return null;
  const k = Math.min(availW / w, availH / h);
  return { w: Math.floor(w * k), h: Math.floor(h * k), scale: k };
}

// ---- attach ----
// Which pages Attach must flatten + upload: every new page, every page whose annotations changed, and
// every page whose BASE image changed (a crop-only edit has no shape change — it must not be skipped).
export function pagesToAttach(pages, origBases, dirty) {
  const out = [];
  pages.forEach((pg, i) => {
    if (pg.key == null || dirty.has(i) || pg.base !== origBases[i]) out.push(i);
  });
  return out;
}

// ---- overlay ----
// Dim everything outside the box, outline it, draw 8 handles. `k` = natural px per display px so the
// chrome keeps a constant on-screen size at any image resolution.
export function drawCropOverlay(ctx, box, W, H, k = 1) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, W, box.y);
  ctx.fillRect(0, box.y + box.h, W, H - box.y - box.h);
  ctx.fillRect(0, box.y, box.x, box.h);
  ctx.fillRect(box.x + box.w, box.y, W - box.x - box.w, box.h);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * k; ctx.setLineDash([]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  const hs = 10 * k, pts = [[0, 0], [.5, 0], [1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [0, .5]];
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = k;
  for (const [fx, fy] of pts) {
    const cx = box.x + box.w * fx, cy = box.y + box.h * fy;
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs); ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
  }
  ctx.restore();
}

// ---- history ----
// One undo stack for annotations AND the base image: `bases` runs parallel to `stack`, so a crop (which
// changes the base) is a single undoable step like any shape.
export const newHistory = (shapes, base) => ({ stack: [shapes || []], bases: [base], i: 0 });
export function pushStep(H, shapes, base) {
  return { stack: [...H.stack.slice(0, H.i + 1), shapes], bases: [...H.bases.slice(0, H.i + 1), base ?? H.bases[H.i]], i: H.i + 1 };
}
export const stepBack = (H) => (H.i > 0 ? { ...H, i: H.i - 1 } : H);
export const stepFwd = (H) => (H.i < H.stack.length - 1 ? { ...H, i: H.i + 1 } : H);

// Write the visible state back to its page (page flip / Attach). `pend` = an unapplied crop, if any.
export function persistPage(pages, idx, H, pend) {
  pages[idx].shapes = pend ? pend.shapes : H.stack[H.i];
  pages[idx].base = pend ? pend.base : H.bases[H.i];
}

// Letter shortcut -> tool. Ctrl/Cmd/Alt combos (copy, reload, ...) belong to the browser, never a tool.
const KEY_TOOLS = { c: "crop", r: "rect", a: "arrow", p: "pen", t: "text" };
export function toolForKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return KEY_TOOLS[String(e.key || "").toLowerCase()] || null;
}
