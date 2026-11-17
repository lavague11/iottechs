import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const TL = createRequire(import.meta.url)("../public/widgets/tile-layout.js");

const box = { x0: 100, x1: 100.4, y0: 50, y1: 50.4 };

test("tiles keep only their top rows — the bottom-edge watermark never enters the mosaic", () => {
  const { tiles } = TL.layout(box, 19);
  for (const t of tiles) assert.equal(t.sh, (TL.TILE - TL.PAD) * 2);   // source rect stops above the attribution strip
  assert.ok(TL.PAD >= 32, "pad clears the logo");
});

test("the kept strips tile the box with no gap or overlap (rows advance by the kept height)", () => {
  const z = 19, sf = Math.pow(2, z) * 2;
  const { tiles, rows, cols, spanY } = TL.layout(box, z);
  assert.ok(rows * spanY >= box.y1 - box.y0 && cols > 0);
  const col0 = tiles.filter(t => t.col === 0).sort((a, b) => a.row - b.row);
  for (let i = 1; i < col0.length; i++) assert.equal(col0[i].dy, col0[i - 1].dy + col0[i - 1].dh);
  // 1:1 pixels — never scaled: dest size equals source size
  for (const t of tiles) { assert.equal(t.dw, t.sw); assert.equal(t.dh, t.sh); }
  assert.equal(sf, 2 ** z * 2);
});

test("tile centre is shifted so the kept (top) region is centred on its cell", () => {
  const z = 19, { tiles, spanY } = TL.layout(box, z);
  const t = tiles[0];
  // image centre sits PAD/2 css px below the kept-region centre
  assert.ok(Math.abs(t.cy - (box.y0 + spanY / 2) - (TL.PAD / 2) / 2 ** z) < 1e-12);
});

test("widget wires it up; capture output contract (size/encoding) code is untouched", () => {
  const sat = fs.readFileSync(new URL("../public/widgets/satellite-capture.html", import.meta.url), "utf8");
  assert.ok(sat.includes('<script src="tile-layout.js'));
  assert.ok(sat.includes("IOTTileLayout.layout(box,zt)"));
  assert.ok(!/span=640\/Math\.pow/.test(sat), "old full-tile layout is gone");
  assert.ok(sat.includes('toDataURL("image/jpeg",0.92)'));
});

test("enhance prompt tells the model not to redraw text", () => {
  const r = fs.readFileSync(new URL("../app/api/enhance/route.js", import.meta.url), "utf8");
  assert.ok(/watermark/.test(r));
});


// ---- attribution: stored imagery is clean; every RENDER / DELIVERY stamps once, against its own size ----
import vm from "node:vm";
import { drawAerialWindow, isSatelliteRaster } from "../lib/survey2-export.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const satSrc = read("../public/widgets/satellite-capture.html");
const mergedSrc = read("../public/widgets/site-survey-merged.html");

// A 2D context that records what is drawn; measureText is 8px/char so boxes are deterministic.
function fakeCtx() {
  const calls = [];
  const g = { calls, font: "", fillStyle: "", shadowColor: "", shadowBlur: 0,
    save() {}, restore() {},
    measureText: (t) => ({ width: t.length * 8 }),
    drawImage: (...a) => calls.push(["drawImage", ...a]),
    fillRect: (...a) => calls.push(["fillRect", ...a]),
    fillText: (...a) => calls.push(["fillText", ...a]) };
  return g;
}
const credits = (g) => g.calls.filter((c) => c[0] === "fillText" && c[1] === TL.CREDIT);

test("creditMetrics: fixed text, no invented year, scales with the output and stays legible", () => {
  assert.equal(TL.CREDIT, "Imagery \u00A9 Google");
  const s = TL.creditMetrics(800, 600), b = TL.creditMetrics(2600, 1800), tiny = TL.creditMetrics(100, 80);
  assert.ok(s.font >= 12 && b.font <= 28 && b.font > s.font);
  assert.equal(tiny.font, 12);
});

test("drawCredit lands in the output's own bottom-right, inside the bounds, for any size", () => {
  for (const [w, h] of [[400, 300], [1000, 800], [2400, 1700]]) {
    const g = fakeCtx(), b = TL.drawCredit(g, w, h);
    assert.equal(credits(g).length, 1);
    assert.ok(b.x > w / 2 && b.y > h / 2, "bottom-right quadrant");
    assert.ok(b.x + b.w <= w && b.y + b.h <= h, "never cropped by the edge");
    const m = TL.creditMetrics(w, h);
    assert.equal(Math.round(w - (b.x + b.w)), m.margin);
    assert.equal(Math.round(h - (b.y + b.h)), m.margin);
  }
});

test("a WINDOWED aerial render is credited even though the window excludes the image's bottom-right corner", () => {
  const im = { naturalWidth: 2000, naturalHeight: 1500 };
  const rect = { x: 0.3, y: 0.25, w: 0.35, h: 0.3 };            // 0.65 / 0.55 — nowhere near the 1.0 / 1.0 corner
  assert.ok(rect.x + rect.w < 0.9 && rect.y + rect.h < 0.9, "this window cannot contain the full image's corner");
  const g = fakeCtx(); drawAerialWindow(g, im, { full: true, rect }, 1200, 900);
  const draw = g.calls.find((c) => c[0] === "drawImage");
  assert.deepEqual(draw.slice(2, 6), [rect.x * 2000, rect.y * 1500, rect.w * 2000, rect.h * 1500]);   // only the window was drawn
  const c = credits(g);
  assert.equal(c.length, 1, "exactly one credit");
  const box = TL.creditBox(1200, 900, TL.CREDIT.length * 8);     // the plate's OWN corner, not the aerial's
  assert.equal(c[0][2], box.textX); assert.equal(c[0][3], box.textY);
  assert.ok(box.x + box.w <= 1200 && box.y + box.h <= 900 && box.x > 900);
});

test("legacy (non-full) aerial path is credited too, once", () => {
  const g = fakeCtx(); drawAerialWindow(g, { naturalWidth: 800, naturalHeight: 800 }, { full: false }, 1200, 900);
  assert.equal(credits(g).length, 1);
});

test("a plain satellite floor is credited on the plate; vector plans and AI plans without an aerial are not", () => {
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "data:image/jpeg;base64,AAAA" }), true);
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "/api/media/abc.jpg" }), true);
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "data:image/svg+xml;base64,AAAA" }), false);
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "/api/media/plan.svg?v=2" }), false);
  assert.equal(isSatelliteRaster({ bg: "data:image/png;base64,AAAA" }), false);
});

test("the STORED aerial is credit-free: trCtx (what becomes ctx.src) draws no credit, so reopen-crop-Use cannot stack them", () => {
  const body = satSrc.match(/function trCtx\(\)\{[\s\S]*?return out; \}/)[0];
  const g = fakeCtx(), made = [];
  const sandbox = {
    capCanvas: { width: 3000, height: 2000 }, tracePts: [{ x: .4, y: .4 }, { x: .6, y: .4 }, { x: .5, y: .6 }],
    capAerial: { northDeg: 10 }, capMetersW: 100, capMetersH: 70, Math, Number,
    document: { createElement: () => { const cv = { getContext: () => g, toDataURL: () => "data:image/jpeg;base64,STORED" }; made.push(cv); return cv; } },
  };
  vm.createContext(sandbox);
  const out = vm.runInContext(`(${body.replace(/^function trCtx/, "function")})()`, sandbox);
  assert.ok(out && out.src === "data:image/jpeg;base64,STORED" && out.full === true);
  assert.equal(credits(g).length, 0, "no credit in the stored context image");
  assert.ok(!g.calls.some((c) => c[0] === "fillText" || c[0] === "fillRect"));
});

test("Use / trace-Use post the raw capture (stored clean); only Download stamps, on a copy", () => {
  const posts = satSrc.match(/satellite-capture-result[^\n]*/g) || [];
  assert.equal(posts.length, 2);
  for (const p of posts) assert.ok(/dataUrl:\$\("prevImg"\)\.src/.test(p), p);
  assert.ok(!/creditDue|creditedUrl/.test(satSrc), "the stamped-state machine is gone");
  const dl = satSrc.match(/function creditedDownloadUrl\(\)[\s\S]*?toDataURL[^\n]*\n/)[0];
  assert.match(dl, /createElement\("canvas"\)/);
  assert.match(dl, /IOTTileLayout\.drawCredit\(g,cv\.width,cv\.height\)/);
  assert.ok(!/capCanvas\s*=[^=]/.test(dl), "never mutates capCanvas (the pixels Enhance sends)");
  assert.match(satSrc, /a\.href=creditedDownloadUrl\(\)/);
  const enh = satSrc.match(/function enhance\(revision\)[\s\S]*?"image\/png"\); \}/)[0];
  assert.ok(!/drawCredit|credited/.test(enh), "Enhance only ever sees clean pixels");
});

test("render surfaces: export stamps both plate paths; the live widget overlays the credit on the plate", () => {
  const ex = read("../lib/survey2-export.js");
  assert.match(ex, /if \(!hybrid && isSatelliteRaster\(f\)\) TileLayout\.drawCredit\(ctx, W, H\)/);
  assert.match(ex, /TileLayout\.drawCredit\(ctx, W, H\);\n\s*\} catch/);
  assert.match(mergedSrc, /<script src="tile-layout\.js/);
  assert.match(mergedSrc, /id="aerialCredit"/);
  assert.match(mergedSrc, /syncViewSeg\(cap, v\);\n\s*aerialCreditSync\(cap, v, f\);/);
  assert.match(mergedSrc, /IOTTileLayout\.creditMetrics\(sc\.offsetWidth/);
});

test("inline <script> blocks of both widgets parse (source-parses does not cover public/widgets)", () => {
  for (const [name, src] of [["satellite-capture", satSrc], ["site-survey-merged", mergedSrc]]) {
    const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(blocks.length > 0, name);
    blocks.forEach((b, i) => assert.doesNotThrow(() => new vm.Script(b), `${name} script #${i}`));
  }
});
