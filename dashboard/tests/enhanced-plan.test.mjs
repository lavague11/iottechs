// Phase 10 — AI Enhanced Floor Plan as a VISUAL LAYER under the canonical vectors (draw-floorplan.html).
// Like openings.test.mjs / rooms.test.mjs this reads the real single-file widget, brace-extracts the pure helpers,
// and evaluates them against stubbed globals — so the tests run the SHIPPING code (or fail to find it). Cost safety
// is the point: AI is optional + explicit, never auto-regenerated, the canonical geometry stays authoritative, and
// an unchanged plan reuses its cached raster (no re-bill). Cells are "c,r" HALF-cell keys; HALF=13.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

// Return the full text of `function name(...){...}` (brace-matched, string/comment tolerant enough for this widget).
function extractFn(s, name) {
  const start = s.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = s.indexOf("{", s.indexOf(")", start));
  assert.ok(i > 0, "no body for " + name);
  let depth = 0, quote = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const HALF = 13, FULL = 26;
// Pure helpers (+ the Phase-10 additions) assembled into one live mini-module with mutable globals, exactly as the
// widget sees them. pushHist/redraw/persist are stubbed counters; the enhance-state vars are plain locals.
const NAMES = [
  "key", "has", "ptLess", "wallKey", "canonOpening", "openKey", "sanitizeOpenings", "sanitizeOpenWalls", "segDistSq",
  "edgesOf", "boundaryEdges", "cellsBBoxPx", "roomLabelCell", "esc", "openSet", "doorArcD", "wallPathD", "structFill", "svgPlanBody",
  "namedRooms", "planCells",
  "_fnv", "planRev", "sanitizeEnhanced", "enhanceStale", "planOut", "applyPlan", "overlaySVG"];
const PURE = NAMES.map((n) => extractFn(src, n)).join("\n");
const api = new Function(`
  var HALF=${HALF}, FULL=${FULL};
  var cells=new Set(), rooms=[], openings=[], openWalls=new Set(), metersPerPx=0, _seed=null, _planStamp=0;
  var enhancedURL=null, enhancedRev=null, enhancedOnce=false, sel=null, _pushes=0;
  var zoneCells={}, areas=[];   // Phase 3 zone cells + named Areas — stubbed here (these tests cover the enhanced raster, not areas)
  function zcOut(){ return {}; } function zcIn(){ return {}; } function zcClone(){ return {}; } function zoneCellsSVG(){ return ""; }
  function namedAreas(l){ return (l||[]).filter(function(a){ return a && (a.label||"").trim() && (a.cells||[]).length; }); }
  function sanitizeAreas(l){ return Array.isArray(l)?l:[]; } function areasFromZoneCells(){ return []; } function syncZoneCellsFromAreas(){} function areasSVG(){ return ""; } function isStairs(){ return false; }
  function pushHist(){ _pushes++; } function redraw(){} function persist(){}
  ${PURE}
  return {
    planRev:planRev, sanitizeEnhanced:sanitizeEnhanced, enhanceStale:enhanceStale, planOut:planOut,
    applyPlan:applyPlan, overlaySVG:overlaySVG, key:key,
    setCells:function(a){ cells=new Set(a); }, setRooms:function(a){ rooms=a; }, setOpenings:function(a){ openings=a; },
    setEnhanced:function(u,r){ enhancedURL=u; enhancedRev=r; }, setMeters:function(m){ metersPerPx=m; }, setStamp:function(t){ _planStamp=t; },
    getEnhancedURL:function(){ return enhancedURL; }, getEnhancedRev:function(){ return enhancedRev; }, getEnhancedOnce:function(){ return enhancedOnce; },
    getCells:function(){ return Array.from(cells); }, getRooms:function(){ return rooms; } };
`)();
const { key } = api;

// A 2x2 half-cell box occupying cols 0..1, rows 0..1 — a self-contained structure for the hashes/exports.
const box2 = [key(0, 0), key(1, 0), key(0, 1), key(1, 1)];

// ---------------------------------------------------------------------------------------------------------------
// planRev — a CONTENT hash of the canonical geometry (determinism + sensitivity)
// ---------------------------------------------------------------------------------------------------------------
function revOf(cells, rooms, openings) {
  api.setCells(cells || []); api.setRooms(rooms || []); api.setOpenings(openings || []); return api.planRev();
}
test("planRev: identical geometry → identical hash (order-independent)", () => {
  const a = revOf(box2, [{ label: "Lobby", cells: [key(0, 0), key(1, 0)] }], []);
  const b = revOf([key(1, 0), key(0, 1), key(1, 1), key(0, 0)],              // cells reordered
    [{ label: "Lobby", cells: [key(1, 0), key(0, 0)] }], []);               // room cells reordered
  assert.equal(a, b, "a content hash must not depend on array order");
  assert.match(a, /^[0-9a-f]{8}$/, "8 hex chars");
});
test("planRev: a changed CELL flips the hash", () => {
  const a = revOf(box2, [], []);
  const b = revOf(box2.concat([key(2, 0)]), [], []);
  assert.notEqual(a, b);
});
test("planRev: a changed ROOM label or room cells flips the hash", () => {
  const base = revOf(box2, [{ label: "Lobby", cells: [key(0, 0)] }], []);
  const renamed = revOf(box2, [{ label: "Office", cells: [key(0, 0)] }], []);
  const recelled = revOf(box2, [{ label: "Lobby", cells: [key(0, 0), key(1, 0)] }], []);
  assert.notEqual(base, renamed, "label is part of the hash");
  assert.notEqual(base, recelled, "room cells are part of the hash");
});
test("planRev: a changed OPENING flips the hash", () => {
  const a = revOf(box2, [], []);
  const b = revOf(box2, [], [{ a: [0, 0], b: [13, 0] }]);
  assert.notEqual(a, b);
});
test("planRev: NOT a timestamp — stamp changes, rev does not", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]);
  api.setStamp(1000); const a = api.planRev();
  api.setStamp(999999); const b = api.planRev();
  assert.equal(a, b, "rev is geometry-only, independent of _planStamp");
});

// ---------------------------------------------------------------------------------------------------------------
// sanitizeEnhanced — restore guard
// ---------------------------------------------------------------------------------------------------------------
test("sanitizeEnhanced: a valid data:image record round-trips; rev coerced to string", () => {
  const out = api.sanitizeEnhanced({ src: "data:image/png;base64,AAAA", rev: 123 });
  assert.deepEqual(out, { src: "data:image/png;base64,AAAA", rev: "123" });
});
test("sanitizeEnhanced: junk / non-data src / missing → null (defensive default)", () => {
  assert.equal(api.sanitizeEnhanced(null), null);
  assert.equal(api.sanitizeEnhanced(undefined), null);
  assert.equal(api.sanitizeEnhanced({}), null);
  assert.equal(api.sanitizeEnhanced({ src: "https://evil.example/x.png", rev: "1" }), null, "only data:image/ is accepted");
  assert.equal(api.sanitizeEnhanced("data:image/png;base64,AAAA"), null, "must be an object");
});

// ---------------------------------------------------------------------------------------------------------------
// enhanced:{src,rev} round-trips through planOut / applyPlan
// ---------------------------------------------------------------------------------------------------------------
test("planOut: emits enhanced:{src,rev} only when a raster exists", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]); api.setEnhanced(null, null);
  assert.ok(!("enhanced" in api.planOut()), "no raster → no enhanced key (default behaviour unchanged)");
  api.setEnhanced("data:image/png;base64,AAAA", "abc12345");
  const o = api.planOut();
  assert.deepEqual(o.enhanced, { src: "data:image/png;base64,AAAA", rev: "abc12345" });
});
test("applyPlan: restores a persisted raster (cache survives reload), sets enhancedOnce", () => {
  api.applyPlan({ v: 1, cells: box2, rooms: [], openings: [], enhanced: { src: "data:image/png;base64,BBBB", rev: "deadbeef" } });
  assert.equal(api.getEnhancedURL(), "data:image/png;base64,BBBB");
  assert.equal(api.getEnhancedRev(), "deadbeef");
  assert.equal(api.getEnhancedOnce(), true);
});
test("applyPlan: no enhanced key → cache cleared to the default (null, not stale carry-over)", () => {
  api.setEnhanced("data:image/png;base64,OLD", "oldrev");          // dirty state from a previous floor
  api.applyPlan({ v: 1, cells: box2, rooms: [], openings: [] });
  assert.equal(api.getEnhancedURL(), null);
  assert.equal(api.getEnhancedRev(), null);
  assert.equal(api.getEnhancedOnce(), false);
});
test("applyPlan: a bad enhanced record is sanitized away (null), geometry still loads", () => {
  api.applyPlan({ v: 1, cells: box2, rooms: [], openings: [], enhanced: { src: "http://x/y.png", rev: "1" } });
  assert.equal(api.getEnhancedURL(), null, "non-data src rejected");
  assert.deepEqual(api.getCells().sort(), box2.slice().sort(), "geometry unaffected");
});
test("round-trip: planOut → applyPlan preserves the raster + rev", () => {
  api.setCells(box2); api.setRooms([{ label: "Lobby", cells: [key(0, 0)] }]); api.setOpenings([]);
  api.setEnhanced("data:image/png;base64,CCCC", api.planRev());
  const saved = api.planOut(), savedRev = saved.enhanced.rev;
  api.applyPlan(saved);
  assert.equal(api.getEnhancedURL(), "data:image/png;base64,CCCC");
  assert.equal(api.getEnhancedRev(), savedRev);
});

// ---------------------------------------------------------------------------------------------------------------
// stale logic — rev mismatch → stale; match → fresh/reuse
// ---------------------------------------------------------------------------------------------------------------
test("enhanceStale: rev matches current geometry → fresh (reuse, no re-bill)", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]);
  api.setEnhanced("data:image/png;base64,AAAA", api.planRev());
  assert.equal(api.enhanceStale(), false);
});
test("enhanceStale: geometry changed since generation → stale", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([]);
  const genRev = api.planRev();
  api.setEnhanced("data:image/png;base64,AAAA", genRev);
  api.setCells(box2.concat([key(2, 0)]));                          // user edited the structure
  assert.equal(api.enhanceStale(), true, "the raster no longer matches the plan");
});
test("enhanceStale: no raster → never stale", () => {
  api.setCells(box2); api.setEnhanced(null, null);
  assert.equal(api.enhanceStale(), false);
});

// ---------------------------------------------------------------------------------------------------------------
// overlaySVG — the canonical vectors re-drawn OVER the raster (transparent, no paper, no grid)
// ---------------------------------------------------------------------------------------------------------------
test("overlaySVG: transparent overlay redraws walls + labels over the raster (not opaque paper)", () => {
  api.setCells(box2); api.setRooms([{ label: "Lobby", cells: [key(0, 0), key(1, 0), key(0, 1), key(1, 1)] }]); api.setOpenings([]);
  const u = api.overlaySVG();
  assert.ok(u && u.indexOf("data:image/svg+xml,") === 0, "an SVG data URL");
  const svg = decodeURIComponent(u.slice("data:image/svg+xml,".length));
  assert.match(svg, /stroke="#111"/, "authoritative walls are drawn on top");
  assert.ok(svg.indexOf("Lobby") >= 0, "the room label is drawn");
  assert.ok(svg.indexOf('fill="#ffffff"') < 0, "no opaque white paper — the AI raster shows through");
  assert.ok(svg.indexOf('id="pg"') < 0, "no baked grid in the overlay");
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/, "matches the object-fit:contain raster frame");
});
test("overlaySVG: a door opening is re-drawn over the raster too", () => {
  api.setCells(box2); api.setRooms([]); api.setOpenings([{ a: [0, 0], b: [13, 0] }]);
  const svg = decodeURIComponent(api.overlaySVG().slice("data:image/svg+xml,".length));
  assert.match(svg, /stroke-opacity="0.5"/, "the door swing/jamb arc (openings) is part of the overlay");
});
test("overlaySVG: empty plan → null (nothing to overlay)", () => {
  api.setCells([]); api.setRooms([]); api.setOpenings([]);
  assert.equal(api.overlaySVG(), null);
});

// ---------------------------------------------------------------------------------------------------------------
// SOURCE READS — cost-safety invariants that can only be proven against the shipping source
// ---------------------------------------------------------------------------------------------------------------
test("source: /api/enhance is fetched from EXACTLY one place (no load/edit/switch calls)", () => {
  assert.equal((src.match(/fetch\("\/api\/enhance"/g) || []).length, 1, "a single call site");
  assert.ok(extractFn(src, "enhance").indexOf('fetch("/api/enhance"') >= 0, "...and it lives inside enhance()");
});
test("source: the cache-reuse path (showEnhanced) performs NO fetch", () => {
  const body = extractFn(src, "showEnhanced");
  assert.ok(/fetch\(/.test(body) === false, "showEnhanced reuses enhancedURL, never calls the API");
  assert.ok(body.indexOf("enhancedURL") >= 0 && body.indexOf("setOverlay()") >= 0, "it shows the cached raster + the vector overlay");
});
test("source: load/restore paths never call the enhance API", () => {
  for (const fn of ["applyPlan", "initWithPlan", "planOut", "persist"]) {
    assert.ok(extractFn(src, fn).indexOf("/api/enhance") < 0, fn + "() must not touch /api/enhance");
  }
});
test("source: the wand guards the fetch on rev — fresh cache reuses, only first/Update re-bills", () => {
  assert.ok(src.indexOf('if(!enhancedURL || enhanceStale()){ enhance(""); return; }') >= 0, "guard present");
  assert.ok(src.indexOf("showEnhanced(); }") >= 0, "fresh cache → reuse");
});
test("source: backToDraw KEEPS the cached raster (does not null enhancedURL)", () => {
  const body = extractFn(src, "backToDraw");
  assert.ok(/enhancedURL\s*=\s*null/.test(body) === false, "the cache survives dismissing the preview");
});
test("source: the Done hand-off contract is UNCHANGED (still posts enhancedURL when present)", () => {
  assert.ok(src.indexOf('type:"satellite-capture-result", dataUrl:enhancedURL, scale:scale') >= 0, "raster hand-off intact");
});
test("source: enhance() records enhancedRev at generation + draws the under-vector overlay", () => {
  const body = extractFn(src, "enhance");
  assert.ok(body.indexOf("genRev=planRev()") >= 0, "capture the geometry's rev when generating");
  assert.ok(body.indexOf("enhancedRev=genRev") >= 0, "stamp the raster with that rev on success");
  assert.ok(body.indexOf("setOverlay()") >= 0, "re-draw the canonical vectors over the result");
});
test("source: planOut persists enhanced:{src,rev}; applyPlan sanitizes it on restore", () => {
  assert.ok(extractFn(src, "planOut").indexOf("o.enhanced={src:enhancedURL") >= 0);
  assert.ok(extractFn(src, "applyPlan").indexOf("sanitizeEnhanced(s.enhanced)") >= 0);
});
