// Site Survey device model (node --test): every planner kind renders, codes/labels, exact projection of
// the planner's percent coordinates, cones only for aimed cone kinds, per-floor scenes, count validation,
// planner ↔ proposal scope mismatches — and the model never drifts from the planner widget's own catalog.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURVEY_GROUPS, kindOf, parseSurveyFloors, surveyDevices, surveyScene, surveyCounts, scopeMismatches, hybridCapable, compositeHybrid } from "../lib/survey2-model.js";
import { PDF_PAGE } from "../lib/proposal-pdf.js";

const spk = (i, x, y) => ({ id: i, k: "spk", x, y, aim: 0, aimed: false, cone: false, fov: 30, tag: `IS${i}`, name: `Speaker ${i}`, color: "#B084E0" });
const cam = (i, x, y, aim) => ({ id: 100 + i, k: "cam", x, y, aim, aimed: aim != null, cone: true, fov: 30, tag: `IC${i}`, name: `Camera ${i}`, color: "#b98a2e", cid: "c" + i });
const audioSurvey = () => JSON.stringify({ floors: [{ name: "Floor 1", bg: "data:image/png;base64,AAA", devices: [{ id: 50, k: "amp", x: 50, y: 50, tag: "IS10", name: "Amp 1" }, ...Array.from({ length: 9 }, (_, i) => spk(i + 1, 10 + i * 9, 20 + (i % 3) * 25))] }] });

test("model covers every kind the planner widget registers (no drift)", () => {
  const html = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
  const widgetKinds = [...html.matchAll(/\{k:"([a-z]+)",name:"[^"]+"/g)].map((m) => m[1]);
  assert.ok(widgetKinds.includes("spk") && widgetKinds.includes("cam"), "parsed the widget catalog");
  const modelKinds = new Set(SURVEY_GROUPS.flatMap((g) => g.items.map((it) => it.k)));
  for (const k of widgetKinds) assert.ok(modelKinds.has(k), `widget kind "${k}" missing from lib/survey2-model.js`);
  // Cone kinds and group colours match the widget too.
  for (const [k, cone] of [["cam", true], ["motion", true], ["glass", true], ["spk", false]]) assert.equal(!!kindOf(k).cone, cone, k);
  assert.equal(kindOf("spk").group.color, "#B084E0");
  assert.equal(kindOf("cam").group.color, "#b98a2e");
});

test("audio survey: nine speakers + amp → nine S-coded markers, no cones, exact percent projection", () => {
  const floors = parseSurveyFloors(audioSurvey());
  assert.equal(floors.length, 1);
  const devs = surveyDevices(floors);
  assert.equal(devs.length, 10);
  const speakers = devs.filter((d) => d.k === "spk");
  assert.deepEqual(speakers.map((d) => d.code), ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"]);
  assert.deepEqual(speakers.map((d) => d.label), Array.from({ length: 9 }, (_, i) => `Speaker ${i + 1}`));
  const scene = surveyScene(floors, 0, 1600, 900);
  assert.equal(scene.count, 10);
  assert.equal(scene.cones.length, 0, "speakers never get a camera cone");
  // Each speaker gets a light-blue coverage ring (a radius circle), the amp does not.
  assert.equal(scene.rings.length, 9, "one coverage ring per speaker");
  assert.ok(scene.rings.every((g) => g.R > 0 && /rgba\(96,\s*165,\s*250/.test(g.fill)), "rings are light-blue and sized");
  const s1 = scene.markers.find((m) => m.code === "S1");
  assert.equal(s1.px, 10 / 100 * 1600); assert.equal(s1.py, 20 / 100 * 900);
  assert.equal(s1.color, "#B084E0");
  assert.equal(scene.showNames, true);
  assert.deepEqual(surveyCounts(floors), { amp: 1, spk: 9 });
});

test("location split: a device carries loc (room) + identity separately; label prefers the room; no room → loc empty", () => {
  const floors = parseSurveyFloors(JSON.stringify({ floors: [{ name: "Floor 1", bg: "x", devices: [
    { id: 1, k: "cam", x: 30, y: 40, tag: "IC1", name: "Access Point 1", locName: "Dining 1" },
    { id: 2, k: "cam", x: 70, y: 40, tag: "IC2", name: "Access Point 2" },   // off every room → no locName
  ] }] }));
  const [a, b] = surveyDevices(floors);
  assert.equal(a.loc, "Dining 1", "room rides on its own field");
  assert.equal(a.identity, "Access Point 1", "identity is the device's own name");
  assert.equal(a.label, "Dining 1", "label prefers WHERE it is");
  assert.equal(b.loc, "", "a device off every room has no room (renders as Unassigned downstream)");
  assert.equal(b.identity, "Access Point 2");
  assert.equal(b.label, "Access Point 2", "label falls back to identity when there's no room");
});

test("cameras: aimed cameras get a cone with the stored aim/fov; an unaimed one does not; mixed kinds keep their own symbols", () => {
  const floors = parseSurveyFloors(JSON.stringify({ floors: [{ name: "Exterior", bg: "x", devices: [cam(1, 30, 40, 90), cam(2, 60, 40, null), spk(1, 80, 80)] }] }));
  const scene = surveyScene(floors, 0, 1000, 1000);
  assert.equal(scene.markers.length, 3);
  assert.equal(scene.cones.length, 1);
  assert.equal(scene.cones[0].aim, 90); assert.equal(scene.cones[0].fov, 30); assert.equal(scene.cones[0].px, 300);
  assert.deepEqual(scene.markers.map((m) => [m.code, m.color]), [["C1", "#b98a2e"], ["C2", "#b98a2e"], ["S1", "#B084E0"]]);
});

test("multiple floors: each scene holds only its own devices; codes keep counting across floors", () => {
  const floors = parseSurveyFloors(JSON.stringify({ floors: [
    { name: "Floor 1", bg: "x", devices: [{ k: "spk", x: 10, y: 10 }, { k: "spk", x: 20, y: 10 }] },
    { name: "Floor 2", bg: "x", devices: [{ k: "spk", x: 30, y: 10 }, { k: "cam", x: 40, y: 10 }] },
    { name: "No background yet", devices: [{ k: "spk", x: 1, y: 1 }] },
  ] }));
  assert.equal(floors.length, 2, "a floor without a background is not a page");
  assert.deepEqual(surveyScene(floors, 0, 100, 100).markers.map((m) => m.code), ["S1", "S2"]);
  assert.deepEqual(surveyScene(floors, 1, 100, 100).markers.map((m) => m.code), ["S3", "C1"]);
});

test("dense plans switch to codes-only markers; annotations are drawn but never scheduled", () => {
  const many = Array.from({ length: 20 }, (_, i) => spk(i + 1, i * 4, 50));
  const floors = parseSurveyFloors(JSON.stringify({ floors: [{ name: "F", bg: "x", devices: [...many, { k: "hazard", x: 5, y: 5 }] }] }));
  const scene = surveyScene(floors, 0, 800, 600);
  assert.equal(scene.showNames, false);
  assert.equal(scene.markers.length, 21);
  assert.equal(surveyCounts(floors).hazard, undefined);
});

test("pxPerFt scales coverage to real feet; without it, coverage falls back to a fixed fraction", () => {
  // Floor is 50 ft wide rendered at 1000 px → 20 px/ft. Speaker default 18 ft radius → 360 px; camera 40 ft throw → 800 px.
  const floors = parseSurveyFloors(JSON.stringify({ floors: [{ name: "F", bg: "x", devices: [
    { k: "spk", x: 50, y: 50 }, { k: "cam", x: 50, y: 50, aim: 90 },
  ] }] }));
  const pxPerFt = 1000 / 50;                         // 20 px/ft
  const scaled = surveyScene(floors, 0, 1000, 1000, { pxPerFt });
  assert.equal(scaled.scaled, true);
  assert.equal(scaled.rings[0].R, Math.round(18 * pxPerFt), "speaker ring = 18 ft × px/ft");
  assert.equal(scaled.cones[0].R, Math.round(40 * pxPerFt), "camera cone reach = 40 ft × px/ft");
  // Unscaled: fixed fractions of the plan, independent of the device's feet value.
  const plain = surveyScene(floors, 0, 1000, 1000);
  assert.equal(plain.scaled, false);
  assert.equal(plain.rings[0].R, Math.round(1000 * 0.12));
  assert.equal(plain.cones[0].R, Math.round(1000 * 0.14));
});

test("scope mismatch: 9 planner speakers vs 10 quoted is surfaced, never changed; matching counts are silent", () => {
  const floors = parseSurveyFloors(audioSurvey());
  const items = (n) => Array.from({ length: n }, (_, i) => ({ id: "b" + i, name: "Ceiling Speaker", qty: 1, price: 0, sub: [{ name: "Ceiling Speaker", qty: 1, price: 75 }, { name: "Speaker Wire Run", qty: 1, price: 150 }] }));
  const opt = (n) => ({ services: [{ key: "sound", label: "Sound System", items: [{ name: "Amplifier (4-Zone)", qty: 1, price: 350 }, ...items(n)] }] });
  assert.deepEqual(scopeMismatches(floors, opt(10)), ["Planner speakers: 9 · proposal speakers: 10"]);
  assert.deepEqual(scopeMismatches(floors, opt(9)), []);
  assert.ok(PDF_PAGE.BOTTOM > 700, "survey pages share the same safe area");
});

test("parseSurveyFloors carries site boundary + zones (for the customer/PDF site context)", () => {
  const raw = JSON.stringify({ floors: [{ name: "F1", bg: "data:image/svg+xml,x",
    boundary: { pts: [[10,10],[90,10],[50,90]] },
    zones: [{ id: "z1", label: "Driveway", type: "driveway", pts: [[20,60],[40,60],[40,85],[20,85]] },
            { id: "z2", label: "", type: "custom", pts: [[1,1]] }],   // <3 pts → dropped
    devices: [] }] });
  const f = parseSurveyFloors(raw)[0];
  assert.ok(f.boundary && f.boundary.pts.length === 3, "boundary carried");
  assert.equal(f.zones.length, 1, "only the valid (>=3 pt) zone survives");
  assert.equal(f.zones[0].type, "driveway");
  // a boundary with <3 pts is dropped to null
  const f2 = parseSurveyFloors(JSON.stringify({ floors: [{ name: "F", bg: "data:image/svg+xml,x", boundary: { pts: [[0,0]] } }] }))[0];
  assert.equal(f2.boundary, null);
  assert.deepEqual(f2.zones, []);
});

// ---- Aligned hybrid: the aerial-under-plan composite the PDF / customer layout now render, matching the planner.
const hybridFloor = (planXf, extra = {}) => ({ name: "F1", bg: "data:image/svg+xml,plan", bgCtx: true,
  ctx: { src: "data:image/png;base64,AERIAL", rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, full: true, ftW: 40, ftH: 30 },
  planSvg: "data:image/svg+xml,planlayer", planXf,
  devices: [{ id: 1, k: "cam", x: 60, y: 50, aim: 0, aimed: true, tag: "IC1", name: "Front" }], ...extra });

test("parseSurveyFloors carries the hybrid composite inputs (ctx / planSvg / bgCtx / planXf / view)", () => {
  const f = parseSurveyFloors(JSON.stringify({ floors: [hybridFloor({ tx: 10, ty: -6, s: 2, rot: 90 }, { view: "layered" })] }))[0];
  assert.ok(f.ctx && f.ctx.src === "data:image/png;base64,AERIAL", "aerial src carried");
  assert.deepEqual(f.ctx.rect, { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, "window rect carried");
  assert.equal(f.ctx.full, true);
  assert.equal(f.planSvg, "data:image/svg+xml,planlayer");
  assert.equal(f.bgCtx, true);
  assert.deepEqual(f.planXf, { tx: 10, ty: -6, s: 2, rot: 90 }, "planXf carried + validated");
  assert.equal(f.view, "layered");
  // A plain floor carries none of it → plan-only everywhere, exactly as before.
  const plain = parseSurveyFloors(JSON.stringify({ floors: [{ name: "F", bg: "x", devices: [] }] }))[0];
  assert.equal(plain.ctx, null); assert.equal(plain.planSvg, null); assert.equal(plain.bgCtx, false); assert.equal(plain.planXf, null);
});

test("hybridCapable / compositeHybrid: composite whenever the floor carries the aerial + plan (identity alignment included)", () => {
  const cap = parseSurveyFloors(JSON.stringify({ floors: [hybridFloor({ tx: 10, ty: -6, s: 2, rot: 90 })] }))[0];
  assert.equal(hybridCapable(cap), true);
  assert.equal(compositeHybrid(cap), true, "capable + non-identity → composite");
  // Identity alignment → still composites (the plan at its DEFAULT position over the aerial), matching the
  // in-app Layered view — the PDF/customer must not fall back to plan-only just because staff never nudged it.
  const id = parseSurveyFloors(JSON.stringify({ floors: [hybridFloor({ tx: 0, ty: 0, s: 1, rot: 0 })] }))[0];
  assert.equal(hybridCapable(id), true);
  assert.equal(compositeHybrid(id), true, "identity alignment still composites (default position)");
  // No planXf at all → still composites at identity (a hybrid-capable floor always shows the aerial).
  const noxf = parseSurveyFloors(JSON.stringify({ floors: [hybridFloor(undefined)] }))[0];
  assert.equal(compositeHybrid(noxf), true);
  // Missing the aerial (ctx) → not capable, even with an alignment set.
  const noctx = parseSurveyFloors(JSON.stringify({ floors: [{ name: "F", bg: "x", bgCtx: true, planSvg: "p", planXf: { tx: 10 }, devices: [] }] }))[0];
  assert.equal(hybridCapable(noctx), false);
  assert.equal(compositeHybrid(noctx), false);
});

test("surveyScene(planXf): a known alignment projects a device to the expected plate pixel; identity falls back to plan-only", () => {
  const floors = parseSurveyFloors(JSON.stringify({ floors: [hybridFloor({ tx: 10, ty: -6, s: 2, rot: 90 })] }));
  const planXf = floors[0].planXf;
  // Plan-only (no planXf): device at 60%,50% of a 1000×1000 plate → (600,500), markers un-scaled.
  const plain = surveyScene(floors, 0, 1000, 1000);
  assert.equal(plain.hybrid, false);
  assert.equal(plain.markers[0].px, 600); assert.equal(plain.markers[0].py, 500);
  const rBase = plain.r;
  // Aligned hybrid: tx+10%,ty-6%,×2,rot90 about the centre → the SAME point the widget paints.
  const near = (a, b, m = "") => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b} ${m}`);
  const hy = surveyScene(floors, 0, 1000, 1000, { planXf });
  assert.equal(hy.hybrid, true);
  near(hy.markers[0].px, 600); near(hy.markers[0].py, 640, "projected onto the aerial");
  assert.equal(hy.r, Math.round(rBase * 2), "marker radius rides the alignment scale");
  // The camera's cone rides the alignment too: aim rotates by rot, reach scales by s.
  assert.equal(hy.cones.length, 1);
  assert.equal(hy.cones[0].aim, 0 + 90, "cone aim rotated by the alignment");
  assert.equal(hy.cones[0].R, Math.round(Math.round(1000 * 0.14) * 2), "cone reach scaled by the alignment");
  near(hy.cones[0].px, 600); near(hy.cones[0].py, 640);
  // An identity planXf is treated as plan-only (no projection, no drift for existing floors).
  const idScene = surveyScene(floors, 0, 1000, 1000, { planXf: { tx: 0, ty: 0, s: 1, rot: 0 } });
  assert.equal(idScene.hybrid, false);
  assert.equal(idScene.markers[0].px, 600); assert.equal(idScene.markers[0].py, 500);
});
