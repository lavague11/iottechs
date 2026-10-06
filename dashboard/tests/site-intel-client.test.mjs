// Phase 7 — Site Intelligence CLIENT (site-survey-merged.html). The widget is single-file ES5 with no exports, so (as in zones.test.mjs)
// we extract the real helpers with a brace matcher and run them against stubbed globals. NO network: fetch is a stub.
// Rules under test: AI output is a DRAFT (siDraft) until Apply writes canonical; the only AI call is the explicit Analyze tap; gated + hidden when off.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start));
  let depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const NAMES = ["zTypeKey", "zTypeLabel", "zLabel", "zNewId", "zValidPts", "zValidZones", "bdValidBoundary", "boundaryToPath", "sideType", "defaultSides", "sidesOf",
  "siZoneType", "imgFracToPlate", "siRect", "siMapPoly", "siSides", "siContext", "siCanon", "siFnv", "siteHash", "siItems", "siPct", "siApply", "siAnalyze", "siActive", "siProbe", "siDiscard", "siImageData"];
const FNS = NAMES.map((n) => extractFn(survey, n)).join("\n");
const ZCONST = survey.slice(survey.indexOf("var ZONE_TYPES="), survey.indexOf("function zTypeKey("));
const SICONST = survey.slice(survey.indexOf("var SI_TYPE_MAP="), survey.indexOf("function siZoneType("));

function build(over = {}) {
  const calls = { flush: 0, renderView: 0, fetch: [], bdLoad: 0 };
  const fetchStub = over.fetch || (async () => { throw new Error("unexpected fetch"); });
  const factory = new Function("window", "document", "crypto", "fetch", "frozen", "flushNow", "renderView", "renderBoundary", "updateRegionUI", "bdLoad", "hybridCapable", "siRender", "siUpdateUI", "siCheckStale", "PID", "RO", "SURVEY_PROP",
    `var SIDE_KEYS=["top","right","bottom","left"], SIDE_COMPASS={top:"Top",right:"Right",bottom:"Bottom",left:"Left"};
     var floors=[], curFloor=0, siteIntelOK=${over.ok === false ? "false" : "true"}, siProbed, siGone=false, siBusy=false, siErr="", siDraft=null, siFloor=null, siSeq=0, siStT=null;
     ${ZCONST}
     ${SICONST}
     ${FNS}
     return { floors:floors, get siDraft(){return siDraft;}, set siDraft(v){siDraft=v;}, get siGone(){return siGone;}, get siBusy(){return siBusy;}, get siErr(){return siErr;}, set siFloor(v){siFloor=v;},
       siApply:siApply, siAnalyze:siAnalyze, siItems:siItems, siActive:siActive, siProbe:siProbe, siMapPoly:siMapPoly, siSides:siSides, siContext:siContext, siteHash:siteHash, siCanon:siCanon, imgFracToPlate:imgFracToPlate, siZoneType:siZoneType, siRect:siRect,
       get siProbed(){return siProbed;}, get siteIntelOK(){return siteIntelOK;} };`);
  const api = factory(
    globalThis, { getElementById: () => null, createElement: () => ({}) }, globalThis.crypto,
    async (url, opts) => { calls.fetch.push({ url, opts }); return fetchStub(url, opts); },
    over.frozen || (() => false), () => { calls.flush++; }, () => { calls.renderView++; }, () => {}, () => {}, () => { calls.bdLoad++; },
    (f) => !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx), () => {}, () => {}, () => {}, over.pid === undefined ? "P1" : over.pid, !!over.ro, "commercial");
  return { api, calls };
}
const hybridFloor = (extra = {}) => Object.assign({ id: "f1", ctx: { src: "data:image/png;base64,AAAA", rect: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, full: true, northDeg: 12 }, planSvg: "<svg/>", bgCtx: true, plan: { cells: [1, 2], rooms: [1] } }, extra);

test("imgFracToPlate: ctx.rect corner -> 0/100, centre -> 50, clamped", () => {
  const { api } = build();
  const rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  assert.deepEqual(api.imgFracToPlate([0.25, 0.25], rect), [0, 0]);
  assert.deepEqual(api.imgFracToPlate([0.75, 0.75], rect), [100, 100]);
  assert.deepEqual(api.imgFracToPlate([0.5, 0.5], rect), [50, 50]);
  assert.deepEqual(api.imgFracToPlate([0, 1], rect), [0, 100], "outside the viewport clamps, never overflows");
  assert.deepEqual(api.imgFracToPlate([0.5, 0.5], null), [50, 50], "no rect = identity");
  assert.equal(api.imgFracToPlate([NaN, 1], rect), null);
});

test("siMapPoly: partly off-viewport keeps the polygon (clamped); wholly outside yields nothing", () => {
  const { api } = build();
  const rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const part = api.siMapPoly([[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], rect);
  assert.equal(part.length, 3);
  assert.deepEqual(part[0], [0, 0]);
  assert.deepEqual(api.siMapPoly([[0.0, 0.0], [0.1, 0.0], [0.1, 0.1]], rect), []);
});

test("AI zone type -> editor type map covers all 13; sidewalk/curb/approaches become labeled custom zones", () => {
  const { api } = build();
  const AI = ["street", "sidewalk", "curb", "driveway", "parking", "front_yard", "rear_yard", "side_yard", "alley", "loading", "entrance", "pedestrian_approach", "vehicle_approach"];
  const editorKeys = ["street", "driveway", "parking", "front-yard", "rear-yard", "side-yard", "alley", "loading", "entrance", "custom"];
  for (const t of AI) assert.ok(editorKeys.includes(api.siZoneType(t).type), t + " maps to a real editor type");
  assert.deepEqual(api.siZoneType("front_yard"), { type: "front-yard", label: "" });
  assert.deepEqual(api.siZoneType("street"), { type: "street", label: "" });
  assert.deepEqual(api.siZoneType("sidewalk"), { type: "custom", label: "Sidewalk" });
  assert.deepEqual(api.siZoneType("curb"), { type: "custom", label: "Curb" });
  assert.deepEqual(api.siZoneType("pedestrian_approach"), { type: "custom", label: "Pedestrian Approach" });
  assert.deepEqual(api.siZoneType("vehicle_approach"), { type: "custom", label: "Vehicle Approach" });
  assert.deepEqual(api.siZoneType("bogus"), { type: "custom", label: "" });
});

test("orientation -> floor.sides: default edges, or the named image edge", () => {
  const { api } = build();
  assert.deepEqual(api.siSides({ front: "Street", rear: null, left: "Neighbor", right: "", confidence: 0.7 }).map((s) => [s.side, s.label]), [["top", "Street"], ["left", "Neighbor"]]);
  assert.deepEqual(api.siSides({ front: "bottom", rear: "top" }).map((s) => [s.side, s.label]), [["bottom", "Front"], ["top", "Rear"]]);
  assert.deepEqual(api.siSides(null), []);
});

test("sourceHash: deterministic SHA-256 hex over a key-order-independent canonical context", async () => {
  const { api } = build();
  const a = await api.siteHash({ b: 1, a: { y: 2, x: [1, 2] } });
  const b = await api.siteHash({ a: { x: [1, 2], y: 2 }, b: 1 });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await api.siteHash({ a: { x: [1, 3], y: 2 }, b: 1 }));
});

test("context: image + grid + transform(rect) + north + structure + metadata + zone types; changes with the aerial/structure/zones", async () => {
  const { api } = build();
  const f = hybridFloor({ zones: [{ id: "z1", type: "street", pts: [] }] });
  const c = api.siContext(f);
  assert.deepEqual(Object.keys(c).sort(), ["grid", "image", "metadata", "north", "structure", "transform", "zones"]);
  assert.equal(c.image, f.ctx.src);
  assert.deepEqual(c.transform.rect, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  assert.equal(c.north, 12);
  assert.equal(c.structure.cells, 2);
  assert.deepEqual(c.metadata, { propertyType: "commercial" });
  assert.deepEqual(c.zones, ["street"]);
  const h0 = await api.siteHash(c);
  assert.equal(h0, await api.siteHash(api.siContext(f)), "stable for identical inputs");
  assert.notEqual(h0, await api.siteHash(api.siContext(hybridFloor({ zones: [] }))), "zones change -> outdated");
  assert.notEqual(h0, await api.siteHash(api.siContext(hybridFloor({ zones: f.zones, plan: { cells: [1, 2, 3], rooms: [1] } }))), "structure change -> outdated");
  assert.notEqual(h0, await api.siteHash(api.siContext(hybridFloor({ zones: f.zones, ctx: { ...f.ctx, src: "data:image/png;base64,BBBB" } }))), "aerial change -> outdated");
});

test("gating: action shows only when siteIntelOK && hybridCapable && !frozen (+ PID, not 503'd)", () => {
  const f = hybridFloor();
  const on = build(); on.api.floors.push(f); assert.equal(on.api.siActive(), true);
  const off = build({ ok: false }); off.api.floors.push(f); assert.equal(off.api.siActive(), false, "probe not configured");
  const fz = build({ frozen: () => true }); fz.api.floors.push(f); assert.equal(fz.api.siActive(), false, "frozen / customer");
  const nocap = build(); nocap.api.floors.push({ ctx: null }); assert.equal(nocap.api.siActive(), false, "no aerial");
  const nopid = build({ pid: "" }); nopid.api.floors.push(f); assert.equal(nopid.api.siActive(), false, "no project");
  assert.match(extractFn(survey, "siActive"), /siteIntelOK\s*&&\s*!siGone\s*&&\s*PID\s*&&\s*hybridCapable\(f\)\s*&&\s*!frozen\(\)/);
  assert.match(extractFn(survey, "siUpdateUI"), /siActive\(\)\?"":"none"/, "button display is driven by siActive");
});

test("probe: ONE cheap GET (no AI), once, never for a frozen/RO survey", async () => {
  assert.equal(survey.split("/api/site-intel?probe=1").length - 1, 1, "exactly one probe URL in the widget");
  const probe = extractFn(survey, "siProbe");
  assert.ok(probe.includes("if(siProbed||RO||frozen()) return; siProbed=true;"), "guarded once + staff/not frozen");
  const { api, calls } = build({ fetch: async () => ({ ok: true, json: async () => ({ ok: true, configured: true }) }) });
  api.siProbe(); api.siProbe(); api.siProbe();
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, "/api/site-intel?probe=1");
  assert.equal(calls.fetch[0].opts && calls.fetch[0].opts.method, undefined, "plain GET");
  const ro = build({ ro: true }); ro.api.siProbe(); assert.equal(ro.calls.fetch.length, 0);
  const fz = build({ frozen: () => true }); fz.api.siProbe(); assert.equal(fz.calls.fetch.length, 0);
});

test("the ONLY /api/site-intel POST is inside siAnalyze, reached only from the Analyze/Again/Retry click handlers", () => {
  const posts = survey.split('fetch("/api/site-intel"').length - 1;
  assert.equal(posts, 1, "exactly one POST call site");
  assert.ok(extractFn(survey, "siAnalyze").includes('fetch("/api/site-intel"'));
  const callers = survey.split("siAnalyze(").length - 1;   // def + btn click + again + retry
  assert.equal(callers, 4, "siAnalyze is defined once and called from exactly three click paths");
  for (const fn of ["renderView", "updateRegionUI", "restore", "save", "flushNow", "queueSave", "siRender", "siUpdateUI", "siProbe", "siCheckStale"]) {
    assert.ok(!extractFn(survey, fn).includes("siAnalyze("), fn + " never triggers analysis");
  }
  assert.ok(survey.includes('btn.addEventListener("click",function(e){ e.stopPropagation(); siAnalyze(false); });'));
  assert.ok(survey.includes('a==="again") siAnalyze(true)'));
});

test("Analyze again sends analyzeAgain:true; first tap does not", async () => {
  let bodies = [];
  const run = { payload: { runId: "r1", siteBoundary: null, orientation: null, zones: [] } };
  const { api } = build({ fetch: async (url, opts) => { if (opts && opts.method === "POST") bodies.push(JSON.parse(opts.body)); return { status: 200, ok: true, json: async () => ({ ok: true, run }) }; } });
  api.floors.push(hybridFloor());
  await new Promise((res) => { api.siAnalyze(false); const t = setInterval(() => { if (!api.siBusy) { clearInterval(t); res(); } }, 5); });
  await new Promise((res) => { api.siAnalyze(true); const t = setInterval(() => { if (!api.siBusy && bodies.length === 2) { clearInterval(t); res(); } }, 5); });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].analyzeAgain, undefined);
  assert.equal(bodies[1].analyzeAgain, true);
  assert.equal(bodies[0].accessId, "P1");
  assert.equal(bodies[0].floorId, "f1");
  assert.match(bodies[0].sourceHash, /^[0-9a-f]{64}$/);
  assert.ok(bodies[0].image.startsWith("data:"));
  assert.deepEqual(Object.keys(bodies[0]).sort(), ["accessId", "floorId", "grid", "image", "metadata", "north", "sourceHash", "structure", "transform", "zones"]);
  assert.ok(extractFn(survey, "siAnalyze").includes("body.analyzeAgain=true"));
});

test("result lands in siDraft ONLY; floor.boundary/zones/sides are untouched until Apply", async () => {
  const payload = { runId: "r1", siteBoundary: { polygon: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]], confidence: 0.8 },
    orientation: { front: "Street", rear: null, left: null, right: null, confidence: 0.6 },
    zones: [{ type: "street", polygon: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.3]], confidence: 0.9 }, { type: "sidewalk", polygon: [[0.3, 0.3], [0.6, 0.3], [0.6, 0.4]], confidence: 0.5 }] };
  const { api, calls } = build({ fetch: async () => ({ status: 200, ok: true, json: async () => ({ ok: true, reused: true, run: { payload } }) }) });
  const f = hybridFloor(); api.floors.push(f);
  await new Promise((res) => { api.siAnalyze(false); const t = setInterval(() => { if (!api.siBusy) { clearInterval(t); res(); } }, 5); });
  assert.ok(api.siDraft, "draft held");
  assert.equal(api.siDraft.payload, payload);
  assert.equal(f.boundary, undefined); assert.equal(f.zones, undefined); assert.equal(f.sides, undefined);
  assert.equal(calls.flush, 0, "nothing persisted by Analyze");
  assert.equal(calls.fetch.length, 1);
  const items = api.siItems(api.siDraft, f);
  assert.deepEqual(items.map((i) => i.id), ["b", "z0", "z1", "stop"]);
  assert.ok(Math.abs(items[0].pts[0][0] - 10) < 1e-6 && Math.abs(items[0].pts[0][1] - 10) < 1e-6, "mapped through ctx.rect");
});

test("Apply writes the INCLUDED items canonical (validated, fresh ids, mapped types), clears the draft, flushes", async () => {
  const payload = { runId: "r1", siteBoundary: { polygon: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]], confidence: 0.8 },
    orientation: { front: "Street", rear: "Yard", left: null, right: null, confidence: 0.6 },
    zones: [{ type: "street", polygon: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.3]], confidence: 0.9 }, { type: "sidewalk", polygon: [[0.3, 0.3], [0.6, 0.3], [0.6, 0.4]], confidence: 0.5 }, { type: "front_yard", polygon: [[0.3, 0.5], [0.6, 0.5], [0.6, 0.6]], confidence: 0.4 }] };
  const { api, calls } = build({ fetch: async () => ({ status: 200, ok: true, json: async () => ({ ok: true, run: { payload } }) }) });
  const f = hybridFloor({ zones: [{ id: "keep", label: "Mine", type: "alley", pts: [[1, 1], [2, 1], [2, 2]] }] }); api.floors.push(f);
  await new Promise((res) => { api.siAnalyze(false); const t = setInterval(() => { if (!api.siBusy) { clearInterval(t); res(); } }, 5); });
  api.siDraft.off.z2 = true;           // user excludes the front yard
  api.siDraft.off.sbottom = true;      // ...and the rear side
  api.siApply();
  assert.equal(api.siDraft, null, "draft cleared");
  assert.equal(calls.flush, 1, "Apply flushes (discrete action)");
  assert.ok(calls.renderView >= 1 && calls.bdLoad === 1);
  assert.equal(f.boundary.pts.length, 4);
  assert.ok(Math.abs(f.boundary.pts[0][0] - 10) < 1e-6 && Math.abs(f.boundary.pts[0][1] - 10) < 1e-6);
  assert.deepEqual(f.zones.map((z) => [z.type, z.label]), [["alley", "Mine"], ["street", "Street"], ["custom", "Sidewalk"]]);
  assert.equal(f.zones[0].id, "keep");
  assert.equal(new Set(f.zones.map((z) => z.id)).size, 3, "unique ids");
  assert.deepEqual(f.sides.top, { label: "Street", type: "street" });
  assert.equal(f.sides.bottom.label, "Rear", "excluded side keeps its default");
});

test("Apply refuses when frozen or Outdated, and a floor that already has a boundary/sides defaults those OFF", async () => {
  const payload = { siteBoundary: { polygon: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7]], confidence: 0.8 }, orientation: { front: "Street", confidence: 0.5 }, zones: [] };
  const mk = async (extra, over) => { const { api, calls } = build(Object.assign({ fetch: async () => ({ status: 200, ok: true, json: async () => ({ ok: true, run: { payload } }) }) }, over)); const f = hybridFloor(extra); api.floors.push(f);
    await new Promise((res) => { api.siAnalyze(false); const t = setInterval(() => { if (!api.siBusy) { clearInterval(t); res(); } }, 5); }); return { api, calls, f }; };
  const { api, calls, f } = await mk({ boundary: { pts: [[1, 1], [9, 1], [9, 9]] }, sides: { top: { label: "Mine", type: "custom" } } });
  assert.equal(api.siDraft.off.b, true); assert.equal(api.siDraft.off.stop, true);
  api.siDraft.stale = true; api.siApply();
  assert.ok(api.siDraft, "stale draft: Apply is a no-op (Analyze Again required)");
  assert.equal(calls.flush, 0);
  assert.deepEqual(f.boundary.pts[0], [1, 1]);
});

test("503 -> 'AI not configured' and the action is gone for the session; 502 -> failed + manual retry only (no auto-retry)", async () => {
  const r503 = build({ fetch: async () => ({ status: 503, ok: false, json: async () => ({ error: "no key" }) }) }); r503.api.floors.push(hybridFloor());
  await new Promise((res) => { r503.api.siAnalyze(false); const t = setInterval(() => { if (!r503.api.siBusy) { clearInterval(t); res(); } }, 5); });
  assert.equal(r503.api.siGone, true); assert.equal(r503.api.siErr, "AI not configured"); assert.equal(r503.api.siActive(), false);
  const r502 = build({ fetch: async () => ({ status: 502, ok: false, json: async () => ({ error: "Analysis failed." }) }) }); r502.api.floors.push(hybridFloor());
  await new Promise((res) => { r502.api.siAnalyze(false); const t = setInterval(() => { if (!r502.api.siBusy) { clearInterval(t); res(); } }, 5); });
  assert.equal(r502.api.siErr, "Analysis failed"); assert.equal(r502.api.siGone, false); assert.equal(r502.calls.fetch.length, 1, "no automatic retry");
  assert.equal(r502.api.siActive(), true, "retry stays available");
});

test("source: Apply path writes canonical; the review/preview render reads siDraft, never floor.boundary/zones", () => {
  const apply = extractFn(survey, "siApply");
  assert.ok(apply.includes("f.boundary=b") && apply.includes("f.zones=merged") && apply.includes("f.sides[it.side]="), "Apply writes boundary/zones/sides");
  assert.ok(apply.includes("flushNow()"), "Apply flushes");
  assert.ok(apply.includes("bdValidBoundary(") && apply.includes("zValidZones("), "validated like hand-drawn geometry");
  for (const fn of ["siAnalyze", "siRender", "siItems", "siCheckStale"]) {
    const src = extractFn(survey, fn);
    assert.ok(!/f\.boundary\s*=[^=]|f\.zones\s*=[^=]|f\.sides\s*=[^=]/.test(src), fn + " never writes canonical geometry");
  }
  const render = extractFn(survey, "siRender");
  assert.ok(render.includes("siDraft") && render.includes("siItems(d,f)"), "render reads the draft");
  assert.ok(!/\.boundary|\.zones/.test(render), "render never reads floor.boundary/zones");
  assert.ok(extractFn(survey, "renderView").includes("siRender()"), "preview follows the view");
  assert.ok(extractFn(survey, "updateRegionUI").includes("siUpdateUI()"));
});

test("Outdated: stale badge + Apply disabled, re-run only via explicit Analyze Again", () => {
  const render = extractFn(survey, "siRender");
  assert.ok(render.includes("Outdated") && render.includes("d.stale||!n"), "badge + disabled Apply");
  const chk = extractFn(survey, "siCheckStale");
  assert.ok(chk.includes("siteHash(siContext(f))") && !chk.includes("siAnalyze("), "stale check only re-hashes, never calls the AI");
});

test("deterministic survey unchanged when AI is off: UI is additive + hidden by default", () => {
  assert.ok(/id="siBtn"[^>]*style="display:none"/.test(survey), "Analyze button hidden until probe+gating");
  assert.ok(/body\.ro #siPanel,body\.frozen #siPanel/.test(survey), "hidden for customer/frozen");
  assert.ok(/<button class="ubtn" id="siBtn"[^>]*aria-label="Analyze Site"[^>]*><svg/.test(survey), "icon-only, aria-labelled, inline SVG");
  assert.ok(extractFn(survey, "siUpdateUI").includes("siActive()"));
});
