import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Phase H2 — "Use Enhanced Background" (lowest-risk): on a hybrid-capable floor, let the user reopen the satellite
// AT THE SAME inherited capture, RE-ENHANCE the aerial (not re-level/crop), and swap ONLY the image under the plan
// (ctx.src). SAME-FRAMING assumption: an unchanged level+crop means the new full aerial lines up under the identical
// ctx.rect, so the Structure/rooms/devices/grid never move. Re-leveling would need full registration (re-derive
// ctx.rect + aerial) — the DEFERRED case, hooked where the comment names enhancedRegistration. The widget is static
// HTML (no imports), so the DOM/handler guards are source-reads; the src-only swap contract is proven by replicating
// the validCtx-equivalent swap the handler runs.
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const has = (s, msg) => assert.ok(survey.includes(s), msg || `missing: ${s}`);

test("the Use Enhanced action exists as a single hybrid-floor button (icon + one-word label, no emoji)", () => {
  has('<button id="enhBtn"', "enhanced button element");
  const i = survey.indexOf('<button id="enhBtn"');
  const btn = survey.slice(i, survey.indexOf("</button>", i));
  assert.ok(btn.includes("<svg"), "icon is inline SVG");
  assert.ok(btn.includes("<span>Enhanced</span>"), "one-word visible label");
  assert.ok(btn.includes('aria-label="Use enhanced background"'), "descriptive aria-label for the icon action");
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(btn), "no emoji in the label/icon");
  // locked states hide it via CSS too (belt-and-braces with the handler's !frozen())
  has("body.ro #enhBtn, body.frozen #enhBtn{display:none!important}", "read-only / submitted hide the button");
});

test("gating: hybrid-capable AND a real background AND not frozen", () => {
  has('b.style.display=(bgHasImage && hybridCapable(floors[curFloor]) && !frozen()) ? "inline-flex" : "none"', "updateEnhancedBtn gates on bgHasImage + hybridCapable + !frozen");
  // re-evaluated on step/floor change and on submit/unsubmit (frozen flips)
  has('updateEnhancedBtn();   // Phase H2: the hybrid-floor "Use Enhanced Background" verb tracks the current floor + step', "goStep re-gates the Enhanced verb");
  const setStatus = survey.slice(survey.indexOf("function setStatus("), survey.indexOf("function setStatus(") + 1100);
  assert.ok(setStatus.includes("updateEnhancedBtn()"), "setStatus re-gates on frozen change");
  // hybridCapable contract unchanged — a non-hybrid (aerial-only) floor never sees this action
  const capable = (f) => !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx);
  assert.equal(capable({ ctx: { src: "x" } }), false, "aerial-only (no Structure) is not hybrid-capable → no Enhanced verb");
  assert.equal(capable({ ctx: { src: "x" }, planSvg: "y", bgCtx: true }), true, "a built Structure plan is hybrid-capable → verb shows");
});

test("click sets pendingCtxSwap then reopens the satellite at the inherited capture", () => {
  const h = survey.slice(survey.indexOf('getElementById("enhBtn").addEventListener'), survey.indexOf('getElementById("enhBtn").addEventListener') + 500);
  assert.ok(h.includes("if(frozen()) return;"), "guards frozen");
  assert.ok(h.includes("if(!f || !hybridCapable(f)) return;"), "guards the gate again at click time");
  assert.ok(h.includes("pendingCtxSwap=true; enterBg(); postAerialRestore(true);"), "flags the swap, opens the satellite, restores the inherited leveled aerial (SAME framing)");
  // in-memory flag declared
  assert.ok(/var pendingCtxSwap=false;/.test(survey), "pendingCtxSwap declared false by default");
});

test("the swap branch is guarded (pendingCtxSwap + no-outline + hybridCapable) and sits BEFORE the outline/applyBackground branches", () => {
  const swapAt = survey.indexOf("if(pendingCtxSwap && !(ev.data.outline && ev.data.outline.pts) && floors[curFloor] && hybridCapable(floors[curFloor])){");
  assert.ok(swapAt > 0, "swap branch present and guarded by pendingCtxSwap + no-outline + hybridCapable");
  const outlineAt = survey.indexOf("if(ol && ol.pts && ol.pts.length>=3){");
  const applyAt = survey.indexOf("applyBackground(ev.data.dataUrl, false,");
  assert.ok(swapAt < outlineAt, "swap branch runs before the Trace→Outline branch");
  assert.ok(swapAt < applyAt, "swap branch runs before the plan-replacing applyBackground path");
});

test("the swap replaces ONLY ctx.src (keeps rect/ftW/ftH), never the plan/devices/bg, uploads the new src, and flushes", () => {
  const b = survey.slice(survey.indexOf("if(pendingCtxSwap &&"), survey.indexOf("if(ol && ol.pts && ol.pts.length>=3){"));
  // built through validCtx (a bad src is rejected → old ctx kept) with rect/ftW/ftH carried from the existing ctx
  assert.ok(b.includes("var swapped=validCtx({ src:ev.data.dataUrl, rect:f.ctx.rect, full:true, ftW:f.ctx.ftW, ftH:f.ctx.ftH,"), "candidate built via validCtx keeping rect/ftW/ftH");
  assert.ok(b.includes("if(swapped){ f.ctx=swapped;"), "only assigns when valid (bad src keeps the old ctx)");
  // it must NOT reassign the Structure/bg/plan layers or the device/boundary/zone data
  assert.ok(!/f\.bg\s*=/.test(b), "never reassigns f.bg");
  assert.ok(!/f\.planSvg\s*=/.test(b), "never reassigns f.planSvg");
  assert.ok(!/f\.bgCtx\s*=/.test(b), "never reassigns f.bgCtx");
  assert.ok(!/f\.plan\s*=/.test(b), "never reassigns f.plan");
  assert.ok(!/f\.devices\s*=/.test(b), "never reassigns f.devices");
  assert.ok(!/f\.boundary\s*=/.test(b), "never reassigns f.boundary");
  assert.ok(!/f\.zones\s*=/.test(b), "never reassigns f.zones");
  assert.ok(!/f\.scale\s*=/.test(b), "never reassigns f.scale");
  assert.ok(!/clearCtx\(/.test(b), "never clears the ctx (that is the plan-replace path we must avoid)");
  // mirror the ctx upload (swap inline blob for an /api/media URL) + persist/redraw
  assert.ok(b.includes("uploadBackground(f.ctx.src, function(url){ if(url && f.ctx){ f.ctx.src=url; flushNow(); renderView(); } });"), "uploads the new src like the existing ctx upload");
  assert.ok(b.includes("pendingCtxSwap=false; curFloorAerial=f.aerial||curFloorAerial;"), "clears the flag + keeps the leveled transform");
  assert.ok(b.includes("exitBg(true); renderView(); flushNow(); return;"), "commits, redraws and persists, then stops (no plan replace)");
});

test("backing out of the satellite clears the pending swap (exitBg handles satBack + refresh-exit)", () => {
  const ex = survey.slice(survey.indexOf("function exitBg("), survey.indexOf("function exitBg(") + 400);
  assert.ok(ex.includes("if(!committed) pendingCtxSwap=false;"), "a non-committing exit cancels the pending swap so a later capture never swaps");
  // satBack still delegates to exitBg(false) — the uncommitted path that clears the flag
  assert.ok(/getElementById\("satBack"\)\.addEventListener\("click", function\(\)\{ exitBg\(false\); \}\)/.test(survey), "satBack → exitBg(false) → flag cleared");
});

test("the same-framing assumption + the deferred full-registration (enhancedRegistration) hook are documented", () => {
  has("SAME-FRAMING", "same-framing assumption called out in source");
  has("enhancedRegistration", "deferred full-registration hook named for the re-level case");
});

// ---- src-only swap independence: replicate the validCtx-equivalent swap and prove ONLY ctx.src changes ----
// Mirrors validCtx (the handler validates the candidate before assigning). rect/ftW/ftH come from the EXISTING ctx,
// so the image under the plan is replaced while the windowing that aligns it to the Structure is byte-identical.
function validCtx(c) {
  if (!c || typeof c !== "object" || typeof c.src !== "string" ||
    !(c.src.indexOf("data:image/") === 0 || c.src.indexOf("/api/media/") === 0) || c.src.length > 2500000) return null;
  const r = c.rect;
  if (!r || !["x", "y", "w", "h"].every((k) => typeof r[k] === "number" && isFinite(r[k]) && r[k] >= 0 && r[k] <= 1) || !(r.w > 0 && r.h > 0)) return null;
  const o = { src: c.src, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, full: !!c.full, northDeg: (typeof c.northDeg === "number" && isFinite(c.northDeg)) ? c.northDeg : null };
  if (+c.ftW > 0 && +c.ftH > 0) { o.ftW = +c.ftW; o.ftH = +c.ftH; }
  return o;
}
// the handler's swap, isolated: given a floor + a capture-result, return the mutated floor (or the untouched one on reject)
function swap(f, data) {
  const swapped = validCtx({ src: data.dataUrl, rect: f.ctx.rect, full: true, ftW: f.ctx.ftW, ftH: f.ctx.ftH,
    northDeg: (data.aerial && Number.isFinite(+data.aerial.northDeg)) ? +data.aerial.northDeg : f.ctx.northDeg });
  if (swapped) { f.ctx = swapped; if (data.aerial && typeof data.aerial === "object") f.aerial = data.aerial; }
  return !!swapped;
}

test("swap keeps rect/ftW/ftH, replaces src, and leaves the Structure/devices/plan layers intact", () => {
  const f = {
    ctx: { src: "data:image/jpeg;base64,OLD", rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, ftW: 120, ftH: 90, full: true, northDeg: -12 },
    aerial: { northDeg: -12, center: { lat: 1, lng: 2 }, zoom: 20 },
    planSvg: "data:image/svg+xml;base64,PLAN", bgCtx: true, plan: { cells: ["0,0"], rooms: [{ name: "Garage" }], metersPerPx: 0.02 },
    bg: "/api/media/bg01", scale: { ftW: 120, ftH: 90 }, boundary: { pts: [[0, 0], [1, 0]] }, zones: [{ name: "Lot" }],
    devices: [{ k: "cam", x: 34, y: 49, cid: "cA" }],
  };
  const planSvg = f.planSvg, bg = f.bg, plan = f.plan, boundary = f.boundary, zones = f.zones, devices = f.devices, rect0 = JSON.parse(JSON.stringify(f.ctx.rect));

  const ok = swap(f, { dataUrl: "data:image/jpeg;base64,NEWENHANCED", aerial: { northDeg: 5, center: { lat: 1, lng: 2 }, zoom: 20 } });
  assert.equal(ok, true, "a valid data: src is accepted");

  // ONLY the image changed
  assert.equal(f.ctx.src, "data:image/jpeg;base64,NEWENHANCED", "ctx.src is the new enhanced image");
  assert.deepEqual(f.ctx.rect, rect0, "ctx.rect is byte-identical → windowing/alignment preserved");
  assert.equal(f.ctx.ftW, 120, "ftW kept"); assert.equal(f.ctx.ftH, 90, "ftH kept"); assert.equal(f.ctx.full, true, "full kept");
  assert.equal(f.ctx.northDeg, 5, "northDeg may follow the re-enhanced capture");

  // Structure / layers / data never reassigned (same object references)
  assert.equal(f.planSvg, planSvg, "planSvg untouched");
  assert.equal(f.bgCtx, true, "bgCtx untouched");
  assert.equal(f.plan, plan, "plan untouched");
  assert.equal(f.bg, bg, "bg untouched");
  assert.equal(f.boundary, boundary, "boundary untouched");
  assert.equal(f.zones, zones, "zones untouched");
  assert.equal(f.devices, devices, "devices untouched");
  assert.equal(f.devices[0].cid, "cA", "device identity untouched");
});

test("a bad src is rejected → the old ctx is kept (nothing destructive)", () => {
  const f = { ctx: { src: "/api/media/old", rect: { x: 0, y: 0, w: 1, h: 1 }, ftW: 100, ftH: 80, full: true }, aerial: { northDeg: 0 } };
  const before = JSON.parse(JSON.stringify(f.ctx));
  const ok = swap(f, { dataUrl: "http://evil.example/x.jpg" });   // not data:/ or /api/media/ → rejected
  assert.equal(ok, false, "an off-origin src fails validCtx");
  assert.deepEqual(f.ctx, before, "the existing ctx is unchanged when the swap is rejected");
});

test("no-outline guard: a Trace→Outline result never triggers the swap (that is the Structure path)", () => {
  // the handler condition: pendingCtxSwap && !(outline && outline.pts) && hybridCapable
  const guard = (pending, data, cap) => !!(pending && !(data.outline && data.outline.pts) && cap);
  assert.equal(guard(true, { outline: { pts: [[0, 0], [1, 0], [1, 1]] } }, true), false, "an outline result is excluded");
  assert.equal(guard(true, { dataUrl: "data:image/jpeg;base64,X" }, true), true, "a plain enhanced capture with the flag set swaps");
  assert.equal(guard(false, { dataUrl: "data:image/jpeg;base64,X" }, true), false, "no flag → normal background path");
  assert.equal(guard(true, { dataUrl: "data:image/jpeg;base64,X" }, false), false, "non-hybrid floor → no swap");
});
