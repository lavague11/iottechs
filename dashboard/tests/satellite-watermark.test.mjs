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


// ---- attribution: NOTHING carries a Google credit, anywhere ----
//
// This file used to assert the opposite: tiles cropped to drop Google's baked-in strip, then ONE clean
// "Imagery © Google" composited back onto every render and delivery. On 2026-11-25 the owner decided to
// carry no attribution at all — planner screen, customer layout, proposal PDF, work order PDF, Review
// thumbnails and the satellite Download — having been told Google Maps Platform's terms ask for one. The
// tests below are the other side of that same coin: they now hold the credit OUT, so it cannot drift back
// in one surface at a time. The TILE CROP above is untouched and still tested — it is about Google's own
// repeated strip smearing under AI Enhance, not about attribution.
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
// Anything written onto a plate at all. The credit was the only text these paths ever drew, so "no text"
// is the honest assertion — stronger than matching one string that could simply be reworded.
const texts = (g) => g.calls.filter((c) => c[0] === "fillText");

test("the credit API is gone from tile-layout; the tile crop it was bundled with is not", () => {
  assert.deepEqual(Object.keys(TL).sort(), ["PAD", "TILE", "layout"]);
  for (const k of ["drawCredit", "creditMetrics", "creditBox", "CREDIT"]) assert.equal(TL[k], undefined, k);
  // The crop is a separate concern and still the reason this module exists.
  assert.equal(typeof TL.layout, "function");
  assert.ok(TL.PAD >= 32);
});

test("a WINDOWED aerial render draws the window and nothing else", () => {
  const im = { naturalWidth: 2000, naturalHeight: 1500 };
  const rect = { x: 0.3, y: 0.25, w: 0.35, h: 0.3 };
  const g = fakeCtx(); drawAerialWindow(g, im, { full: true, rect }, 1200, 900);
  const draw = g.calls.find((c) => c[0] === "drawImage");
  assert.deepEqual(draw.slice(2, 6), [rect.x * 2000, rect.y * 1500, rect.w * 2000, rect.h * 1500]);
  assert.equal(texts(g).length, 0, "no credit on the plate a customer reads");
  assert.ok(!g.calls.some((c) => c[0] === "fillRect"), "and no chip behind one");
});

test("the legacy (non-full) aerial path draws nothing on top either", () => {
  const g = fakeCtx(); drawAerialWindow(g, { naturalWidth: 800, naturalHeight: 800 }, { full: false }, 1200, 900);
  assert.equal(texts(g).length, 0);
});

test("isSatelliteRaster still names the distinction, though nothing stamps on it now", () => {
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "data:image/jpeg;base64,AAAA" }), true);
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "/api/media/abc.jpg" }), true);
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "data:image/svg+xml;base64,AAAA" }), false);
  assert.equal(isSatelliteRaster({ aerial: { northDeg: 0 }, bg: "/api/media/plan.svg?v=2" }), false);
  assert.equal(isSatelliteRaster({ bg: "data:image/png;base64,AAAA" }), false);
});

test("the STORED aerial was always clean, and still is: trCtx composites nothing", () => {
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
  assert.ok(!g.calls.some((c) => c[0] === "fillText" || c[0] === "fillRect"));
});

test("every exit from the satellite tool hands out the raw capture — Use, trace-Use and Download alike", () => {
  const posts = satSrc.match(/satellite-capture-result[^\n]*/g) || [];
  assert.equal(posts.length, 2);
  for (const q of posts) assert.ok(/dataUrl:\$\("prevImg"\)\.src/.test(q), q);
  assert.ok(!/creditedDownloadUrl|creditDue|creditedUrl|drawCredit/.test(satSrc), "no stamping path left");
  assert.match(satSrc, /a\.href=\$\("prevImg"\)\.src; a\.download="satellite-capture\.jpg"/,
    "Download is the stored bytes, not a stamped copy");
});

test("no render surface carries a credit: not the export plates, not the live planner", () => {
  const ex = read("../lib/survey2-export.js");
  assert.ok(!/drawCredit|TileLayout/.test(ex), "the exporter no longer imports or calls it");
  assert.ok(!/aerialCredit|creditMetrics/.test(mergedSrc), "nor does the planner overlay one");
  assert.ok(!/tile-layout\.js/.test(mergedSrc), "which is why the planner stopped loading tile-layout at all");
  // the satellite widget still needs it — that is where the CROP runs.
  assert.match(satSrc, /<script src="tile-layout\.js/);
});

test("inline <script> blocks of both widgets parse (source-parses does not cover public/widgets)", () => {
  for (const [name, src] of [["satellite-capture", satSrc], ["site-survey-merged", mergedSrc]]) {
    const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(blocks.length > 0, name);
    blocks.forEach((b, i) => assert.doesNotThrow(() => new vm.Script(b), `${name} script #${i}`));
  }
});
