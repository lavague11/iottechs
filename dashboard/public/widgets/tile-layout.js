/* tile-layout.js — where each Static Maps tile goes in the capture mosaic, and which part of it is kept.
   Every Google Static Maps tile carries the Google logo + imagery attribution along its BOTTOM edge. Butted
   edge to edge (the old layout) a 4x4 capture holds that text 16 times; the AI Enhance pass then redraws it
   at 1024px as blown-up, smeared lettering. So each tile contributes only its top (640 - PAD) css-px rows and
   the next row of tiles starts where that ends: the watermark never enters the mosaic. Pure maths, shared by
   the widget (window.IOTTileLayout) and node tests. Output size, aspect and encoding of the capture are
   untouched — only which source pixels fill the mosaic.

   NO CREDIT LINE. This module used to crop the tile watermark and then composite one clean
   "Imagery © Google" back onto every render and delivery. The owner decided on 2026-11-25 to carry no
   attribution anywhere — screen, exports, PDFs and Download — and made that call knowing Google Maps
   Platform's terms ask for it. The CROP below is a separate concern and still earns its keep: butted
   tiles repeat Google's own baked-in strip once per tile, and the AI Enhance pass smears it. */
(function (root) {
  var TILE = 640;      // Static Maps size= (css px); scale=2 doubles the bitmap
  var PAD = 40;        // css px trimmed off each tile's bottom — just enough to clear the tile's own baked-in logo/attribution strip.

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

  root.IOTTileLayout = { layout: layout, TILE: TILE, PAD: PAD };
  if (typeof module !== "undefined" && module.exports) module.exports = root.IOTTileLayout;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
