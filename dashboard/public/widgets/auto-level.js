/* =====================================================================
   IOT TECHS — Auto-Level core (property-facing aerial orientation)
   ---------------------------------------------------------------------
   PURE, DOM-free, dependency-free. Loaded as a classic <script> by
   satellite-capture.html (exposes window.IOTAutoLevel), and imported
   directly by node tests. The widget supplies a north-up Static-Maps
   raster + the geocoded property anchor; this module finds the frontage
   road, then returns the rotation that lands that road along the BOTTOM
   with the property above it (curbside-facing).

   The line detector here is a compact Sobel+Hough pass. It lives behind
   detectLines() so a heavier engine (e.g. OpenCV HoughLinesP) can replace
   that one function without touching the frontage-selection / flip math,
   which is the part that has to be correct and is unit-tested.

   Geometry conventions (match the widget):
   - Image pixel space is y-DOWN (row 0 at top), like a canvas.
   - Rotation is applied by the widget as CSS `transform: rotate(deg)`,
     clockwise-positive in screen space. screenY() below mirrors that so
     the flip decision agrees with what the user sees.
   - A line's "normal angle" θn is the gradient direction; the road
     DIRECTION is θn-90. We keep angles in degrees.
   ===================================================================== */
(function (root) {
  "use strict";

  var DEG = Math.PI / 180;

  // Normalize to (-180, 180] — same contract as the widget's norm().
  function norm(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  // Fold an angle to [0,180) — a line and its 180° twin are the same line.
  function mod180(d) { return ((d % 180) + 180) % 180; }

  // Screen-space y of a vector (vx,vy) after a CSS rotate(phiDeg).
  // Canvas/screen y is DOWN, CSS rotate is clockwise-positive, so this is
  // the standard rotation matrix: [cos -sin; sin cos] · v, y-component.
  // < 0 means the vector points UP on screen (toward the top).
  function screenY(phiDeg, vx, vy) {
    var r = phiDeg * DEG;
    return Math.sin(r) * vx + Math.cos(r) * vy;
  }

  // Given the road DIRECTION angle (deg, y-down), a point on the road,
  // and the property anchor, return the view rotation that makes the road
  // horizontal AND puts it at the BOTTOM (property above).
  // Evaluates BOTH horizontal orientations (phi0 and phi0+180) — the full
  // circle, not a [-90,90] fold — and picks the one where the anchor sits
  // above the road line on screen.
  function targetRotation(roadDirDeg, roadPt, anchor) {
    var phi0 = norm(-roadDirDeg);                    // road direction -> horizontal
    var vx = anchor.x - roadPt.x, vy = anchor.y - roadPt.y;   // road -> property
    // Want the property ABOVE the road => its screen-y negative.
    var final = (screenY(phi0, vx, vy) < 0) ? phi0 : norm(phi0 + 180);
    return norm(final);
  }

  /* ---------------- image helpers (operate on {data,width,height}) ------- */

  // Downsample RGBA ImageData to grayscale Float32 at a target longest edge.
  // Returns { g, w, h, scale } where scale maps DOWNSCALED px -> ORIGINAL px.
  function toGray(img, maxEdge) {
    maxEdge = maxEdge || 420;
    var W = img.width, H = img.height, data = img.data;
    var s = Math.min(1, maxEdge / Math.max(W, H));
    var w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    var g = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      var sy = Math.min(H - 1, Math.floor(y / s));
      for (var x = 0; x < w; x++) {
        var sx = Math.min(W - 1, Math.floor(x / s));
        var i = (sy * W + sx) * 4;
        // Rec.601 luma
        g[y * w + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
    }
    return { g: g, w: w, h: h, scale: W / w };   // scale back to original px
  }

  // 3x3 box blur in place-ish (returns a new array) — tame roof/asphalt speckle.
  function blur3(g, w, h) {
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var s = 0, n = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var yy = y + dy, xx = x + dx;
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        s += g[yy * w + xx]; n++;
      }
      out[y * w + x] = s / n;
    }
    return out;
  }

  /* ---------------- detector: Sobel + restricted Hough -------------------
     Replaceable slot. Returns candidate straight lines as:
       { dir, nx, ny, rho, px, py, strength }
     dir = road direction angle [0,180) (deg, y-down)
     (nx,ny) = unit normal; rho = signed distance of the line from the image
     CENTER along the normal; (px,py) = foot point = center + rho*(nx,ny);
     strength ~ accumulated edge magnitude (proxy for length).
     ---------------------------------------------------------------------- */
  function detectLines(img, opts) {
    opts = opts || {};
    var gr = toGray(img, opts.maxEdge || 420);
    var g = blur3(gr.g, gr.w, gr.h);
    var w = gr.w, h = gr.h;
    var cx = (w - 1) / 2, cy = (h - 1) / 2;
    var RHO_BIN = 2;                                   // px per rho bin
    var DMAX = Math.ceil(Math.sqrt(cx * cx + cy * cy)); // max |rho|
    var nRho = Math.ceil((2 * DMAX) / RHO_BIN) + 1;
    var nTh = 180;                                      // 1-degree theta bins (normal angle)
    var acc = new Float32Array(nTh * nRho);
    // Magnitude threshold is adaptive: compute mags first, keep strong edges.
    var mags = new Float32Array(w * h), gxA = new Float32Array(w * h), gyA = new Float32Array(w * h);
    var maxMag = 0;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var i = y * w + x;
      var a = g[i - w - 1], b = g[i - w], c = g[i - w + 1];
      var d = g[i - 1], f = g[i + 1];
      var p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
      var gx = (c + 2 * f + r) - (a + 2 * d + p);
      var gy = (p + 2 * q + r) - (a + 2 * b + c);
      var m = Math.sqrt(gx * gx + gy * gy);
      mags[i] = m; gxA[i] = gx; gyA[i] = gy;
      if (m > maxMag) maxMag = m;
    }
    if (maxMag <= 0) return { lines: [], w: w, h: h, cx: cx, cy: cy, scale: gr.scale };
    var thr = maxMag * (opts.edgeFrac || 0.18);        // keep the firm edges only
    // Vote: each strong edge pixel votes for the line through it at its
    // gradient (normal) orientation, ±1° to absorb quantization.
    for (var yy = 1; yy < h - 1; yy++) for (var xx = 1; xx < w - 1; xx++) {
      var ii = yy * w + xx, mg = mags[ii];
      if (mg < thr) continue;
      var gang = Math.atan2(gyA[ii], gxA[ii]) / DEG;   // gradient = normal angle, (-180,180]
      var thn = mod180(gang);                          // fold to [0,180)
      for (var dt = -1; dt <= 1; dt++) {
        var tb = ((Math.round(thn) + dt) % 180 + 180) % 180;
        var rad = tb * DEG;
        var rho = (xx - cx) * Math.cos(rad) + (yy - cy) * Math.sin(rad);
        var rb = Math.round((rho + DMAX) / RHO_BIN);
        if (rb < 0 || rb >= nRho) continue;
        acc[tb * nRho + rb] += mg;
      }
    }
    // Collect local-maxima peaks.
    var peaks = [];
    for (var t = 0; t < nTh; t++) for (var rr = 1; rr < nRho - 1; rr++) {
      var v = acc[t * nRho + rr];
      if (v <= 0) continue;
      // local max along rho (cheap, dominant axis)
      if (v < acc[t * nRho + rr - 1] || v < acc[t * nRho + rr + 1]) continue;
      peaks.push({ t: t, rb: rr, v: v });
    }
    peaks.sort(function (A, B) { return B.v - A.v; });
    var lines = [], used = [];
    for (var pi = 0; pi < peaks.length && lines.length < (opts.maxLines || 12); pi++) {
      var pk = peaks[pi];
      // suppress near-duplicate (angle+rho) peaks
      var dup = false;
      for (var u = 0; u < used.length; u++) {
        var dth = Math.abs(used[u].t - pk.t); dth = Math.min(dth, 180 - dth);
        if (dth <= 3 && Math.abs(used[u].rb - pk.rb) <= 3) { dup = true; break; }
      }
      if (dup) continue;
      used.push(pk);
      var thnDeg = pk.t, radn = thnDeg * DEG;
      var rhoPx = pk.rb * RHO_BIN - DMAX;
      var nx = Math.cos(radn), ny = Math.sin(radn);
      lines.push({
        dir: mod180(thnDeg - 90),                      // road direction
        nx: nx, ny: ny, rho: rhoPx,
        px: cx + rhoPx * nx, py: cy + rhoPx * ny,       // foot point (downscaled px)
        strength: pk.v
      });
    }
    return { lines: lines, w: w, h: h, cx: cx, cy: cy, scale: gr.scale };
  }

  /* ---------------- frontage selection ---------------------------------
     Choose the primary street the property fronts. Rejects central lines
     (roof ridges), short/weak lines, and prefers a strong PERIPHERAL line
     with the anchor on its interior side. Ambiguous -> {ok:false}.
     `lines` are in DOWNSCALED px (from detectLines); `anchor` too.
     ---------------------------------------------------------------------- */
  function pickFrontage(lines, anchor, w, h, opts) {
    opts = opts || {};
    if (!lines || !lines.length) return { ok: false, reason: "no-lines" };
    var cx = (w - 1) / 2, cy = (h - 1) / 2;
    var diag = Math.sqrt(w * w + h * h);
    var ax = anchor.x, ay = anchor.y;
    // anchor well outside frame -> can't trust side-of-road
    var margin = opts.anchorMargin != null ? opts.anchorMargin : 0.35;
    if (ax < -margin * w || ax > (1 + margin) * w || ay < -margin * h || ay > (1 + margin) * h) {
      return { ok: false, reason: "anchor-offframe" };
    }
    var maxStrength = 0;
    for (var i = 0; i < lines.length; i++) if (lines[i].strength > maxStrength) maxStrength = lines[i].strength;
    var scored = [];
    for (var j = 0; j < lines.length; j++) {
      var L = lines[j];
      // peripheral weight: lines near the center (|rho| small) are likely
      // roof/building ridges, not street frontage — down-weight them.
      var peri = Math.min(1, Math.abs(L.rho) / (0.18 * diag));
      // anchor interior preference: the property should sit between the
      // line and the image center (road toward the edge, property inside).
      var distAnchor = (ax - cx) * L.nx + (ay - cy) * L.ny - L.rho;  // signed dist anchor->line
      // same sign as rho means the line is on the OUTER side from center and
      // the anchor is on the inner side -> frontage-like. Reward that.
      var interior = (L.rho === 0) ? 0 : (distAnchor * L.rho < 0 ? 1 : 0.35);
      // proximity: a nearer frontage edge beats a far one of equal strength.
      var prox = 1 - Math.min(1, Math.abs(distAnchor) / (0.9 * diag));
      var score = (L.strength / (maxStrength || 1)) * (0.45 + 0.55 * peri) * (0.5 + 0.5 * interior) * (0.6 + 0.4 * prox);
      scored.push({ L: L, score: score });
    }
    scored.sort(function (A, B) { return B.score - A.score; });
    var best = scored[0], second = scored[1];
    // Confidence: strong winner, and (if there's a runner-up at a very
    // different angle) it must be clearly beaten — else the frontage is
    // ambiguous (corner lot) and we DON'T guess.
    var conf = best.score;
    if (second) {
      var dAng = Math.abs(best.L.dir - second.L.dir); dAng = Math.min(dAng, 180 - dAng);
      if (dAng > 22 && second.score > 0.8 * best.score) {
        return { ok: false, reason: "ambiguous-frontage", confidence: best.score };
      }
    }
    if (conf < (opts.minConfidence != null ? opts.minConfidence : 0.16)) {
      return { ok: false, reason: "low-confidence", confidence: conf };
    }
    return {
      ok: true,
      angle: best.L.dir,                 // road direction [0,180)
      roadPoint: { x: best.L.px, y: best.L.py },
      normal: { x: best.L.nx, y: best.L.ny },
      confidence: conf
    };
  }

  /* ---------------- orchestrator ---------------------------------------
     img      : ImageData-like {data,width,height} — the north-up aerial.
     anchor   : {x,y} property marker in ORIGINAL image px.
     Returns  : {ok:true, rotation, angle, confidence} to feed rotCoarse,
                or {ok:false, reason} to show a status (no rotation).
     ---------------------------------------------------------------------- */
  function analyze(img, anchor, opts) {
    opts = opts || {};
    if (!img || !img.data || !img.width || !img.height) return { ok: false, reason: "no-image" };
    var det = detectLines(img, opts);
    if (!det.lines.length) return { ok: false, reason: "no-lines" };
    // project the anchor into downscaled detector px
    var a = { x: anchor.x / det.scale, y: anchor.y / det.scale };
    var pick = pickFrontage(det.lines, a, det.w, det.h, opts);
    if (!pick.ok) return pick;
    var rot = targetRotation(pick.angle, pick.roadPoint, a);
    // Perpendicular distance property->frontage road, back in ORIGINAL image px — Auto-Frame turns this
    // into meters to choose the zoom (road sits in the lower part of the frame). det.scale: downscaled->original.
    var roadDistPx = Math.abs((a.x - pick.roadPoint.x) * pick.normal.x + (a.y - pick.roadPoint.y) * pick.normal.y) * det.scale;
    return { ok: true, rotation: rot, angle: pick.angle, confidence: pick.confidence, roadDistPx: roadDistPx };
  }

  root.IOTAutoLevel = {
    norm: norm, mod180: mod180, screenY: screenY,
    targetRotation: targetRotation,
    toGray: toGray, detectLines: detectLines,
    pickFrontage: pickFrontage, analyze: analyze,
    _version: "2026-10-20"
  };

  if (typeof module !== "undefined" && module.exports) module.exports = root.IOTAutoLevel;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
