/* tile-layout.js — where each Static Maps tile goes in the capture mosaic, and which part of it is kept.
   Every Google Static Maps tile carries the Google logo + imagery attribution along its BOTTOM edge. Butted
   edge to edge (the old layout) a 4x4 capture holds that text 16 times; the AI Enhance pass then redraws it
   at 1024px as blown-up, smeared lettering. So each tile contributes only its top (640 - PAD) css-px rows and
   the next row of tiles starts where that ends: the watermark never enters the mosaic. Pure maths, shared by
   the widget (window.IOTTileLayout) and node tests. Output size, aspect and encoding of the capture are
   untouched — only which source pixels fill the mosaic. */
(function (root) {
  var TILE = 640;      // Static Maps size= (css px); scale=2 doubles the bitmap
  var PAD = 40;        // css px trimmed off each tile's bottom. It only needs to clear the tile's own baked-in logo/attribution strip;
                       // the credit Google's terms require is put back ONCE on the finished image (creditMetrics, below).

  // box: { x0, x1, y0, y1 } in world units (256 = whole world); zt: zoom; sf = 2^zt * 2 (mosaic px / world unit).
  function layout(box, zt, pad) {
    pad = pad == null ? PAD : pad;
    var z = Math.pow(2, zt), sf = z * 2;
    var spanX = TILE / z, spanY = (TILE - pad) / z;
    var cols = Math.ceil((box.x1 - box.x0) / spanX), rows = Math.ceil((box.y1 - box.y0) / spanY);
    var tiles = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      tiles.push({
        col: c, row: r,
        cx: box.x0 + (c + 0.5) * spanX,
        cy: box.y0 + (r + 0.5) * spanY + (pad / 2) / z,   // kept region is the TOP of the image → image centre sits pad/2 below it
        dx: Math.round(c * spanX * sf), dy: Math.round(r * spanY * sf),
        dw: Math.round(spanX * sf), dh: Math.round(spanY * sf),
        sw: TILE * 2, sh: (TILE - pad) * 2                 // source rect (from 0,0) in bitmap px
      });
    }
    return { cols: cols, rows: rows, spanX: spanX, spanY: spanY, tiles: tiles };
  }

  // The single attribution line composited onto every stored/delivered image (never onto pixels sent to Enhance).
  // Text is fixed; no year is invented (Static Maps does not return one). Bottom-right, scaled to the image.
  var CREDIT = "Imagery © Google";
  function creditMetrics(w, h) {
    var font = Math.max(12, Math.min(28, Math.round(Math.min(w, h) * 0.018)));
    return { text: CREDIT, font: font, padX: Math.round(font * 0.5), padY: Math.round(font * 0.3), margin: Math.round(font * 0.6) };
  }

  // Pixel box of the credit on an image of w x h whose text measures textW px at the metrics' font size.
  function creditBox(w, h, textW) {
    var m = creditMetrics(w, h), bw = textW + 2 * m.padX, bh = m.font + 2 * m.padY, x = w - m.margin - bw, y = h - m.margin - bh;
    return { x: x, y: y, w: bw, h: bh, font: m.font, textX: x + m.padX, textY: y + m.padY + Math.round(m.font * 0.8) };
  }
  // Draw the credit onto a 2D context for an output of w x h. EVERY render/delivery surface calls this with ITS OWN
  // dimensions (survey export plate, Download); nothing stored carries a credit, so the model never sees one.
  function drawCredit(g, w, h) {
    var m = creditMetrics(w, h);
    g.save();
    g.font = "600 " + m.font + "px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
    var b = creditBox(w, h, Math.ceil(g.measureText(m.text).width));
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(b.x, b.y, b.w, b.h);
    g.shadowColor = "rgba(0,0,0,.8)"; g.shadowBlur = Math.max(2, Math.round(m.font * 0.2));
    g.fillStyle = "rgba(255,255,255,.95)"; g.fillText(m.text, b.textX, b.textY);
    g.restore();
    return b;
  }

  root.IOTTileLayout = { layout: layout, creditMetrics: creditMetrics, creditBox: creditBox, drawCredit: drawCredit, CREDIT: CREDIT, TILE: TILE, PAD: PAD };
  if (typeof module !== "undefined" && module.exports) module.exports = root.IOTTileLayout;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
