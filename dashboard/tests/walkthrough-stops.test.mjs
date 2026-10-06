// System Walkthrough (node --test): stops come from the ONE canonical survey (cameras + speakers with
// coverage), coverage projects from the stored geometry, place labels come from device-context.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStops, coverageShape, isStopDevice, stopPlace } from "../lib/walkthrough-stops.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const cam = (o) => ({ k: "cam", x: 10, y: 10, aim: 0, aimed: false, fov: 30, range: 40, ...o });
const spk = (o) => ({ k: "spk", x: 50, y: 50, ring: true, range: 18, ...o });

test("buildStops: cameras then speakers per floor, real names, nothing fabricated for other kinds", () => {
  const floors = [
    { name: "A", devices: [spk({ name: "Patio Spk" }), { k: "nvr", x: 1, y: 1 }, cam({ name: "Front Door", cid: "c1" }), cam({ name: "" }), spk({ name: "" })] },
    { name: "B", devices: [cam({ name: "Rear", photo: "data:image/png;base64,B" })] },
  ];
  const s = buildStops(floors, [{ url: "data:image/png;base64,P", name: "front door" }]);
  assert.deepEqual(s.map((x) => x.name), ["Front Door", "Camera 2", "Patio Spk", "Speaker 2", "Rear"]);
  assert.deepEqual(s.map((x) => x.kind), ["cam", "cam", "spk", "spk", "cam"]);
  assert.deepEqual(s.map((x) => x.n), [1, 2, 3, 4, 1]);            // marker numbers restart per floor
  assert.equal(s[0].shot, "data:image/png;base64,P");               // mockup photo by camera name
  assert.equal(s[4].shot, "data:image/png;base64,B");               // device's own photo wins
  assert.equal(new Set(s.map((x) => x.key)).size, s.length);
});

test("buildStops: legacy cams-only floors still work; empty/sparse input is safe", () => {
  const s = buildStops([{ name: "A", cams: [cam({ name: "One" })] }]);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "cam");
  assert.deepEqual(buildStops([]), []);
  assert.deepEqual(buildStops(undefined), []);
  assert.deepEqual(buildStops([{ name: "A", devices: [] }]), []);
});

test("speaker stop rule: placed + (photo or non-zero reach); explicit zero reach without a photo is skipped", () => {
  assert.equal(isStopDevice(spk({}), "spk"), true);
  assert.equal(isStopDevice(spk({ range: undefined }), "spk"), true);       // default reach applies
  assert.equal(isStopDevice(spk({ range: 0 }), "spk"), false);
  assert.equal(isStopDevice(spk({ range: 0, photo: "data:x" }), "spk"), true);
  assert.equal(isStopDevice(spk({ x: null }), "spk"), false);
  assert.equal(isStopDevice({ k: "nvr", x: 1, y: 1 }, "nvr"), false);
});

test("coverageShape: scaled floor -> feet x px/ft; speaker is a ring, un-aimed camera has none", () => {
  const plate = { l: 10, t: 5, w: 200, h: 100 };
  const floor = { scale: { ftW: 100, ftH: 50 } };                  // 2 px per foot
  const c = coverageShape(cam({ x: 50, y: 50, aim: 90, aimed: true, fov: 60, range: 40 }), floor, plate);
  assert.equal(c.kind, "cone");
  assert.equal(c.px, 110); assert.equal(c.py, 55); assert.equal(c.rot, 90);
  assert.equal(c.reach, 80);
  const r = coverageShape(spk({ x: 0, y: 100, range: 18 }), floor, plate);
  assert.equal(r.kind, "ring"); assert.equal(r.reach, 36); assert.equal(r.rot, 0);
  assert.equal(r.px, 10); assert.equal(r.py, 105);
  assert.ok(r.d.startsWith("M -36 0 A 36.0 36.0"));
  assert.equal(coverageShape(cam({}), floor, plate), null);        // not aimed
  assert.equal(coverageShape(cam({ aimed: true }), floor, null), null); // plate not measured yet
});

test("coverageShape: unscaled floor falls back to the planner's fixed fractions (never invented feet)", () => {
  const plate = { l: 0, t: 0, w: 200, h: 100 };
  assert.equal(coverageShape(cam({ aimed: true }), { scale: null }, plate).reach, 30);   // min(w,h) * 0.3
  assert.equal(coverageShape(spk({}), {}, plate).reach, 12);                              // min(w,h) * 0.12
});

test("stopPlace: side only when the survey knows the structure; room/zone/coverage word; empty without context", () => {
  const zones = [{ id: "z1", label: "Parking", type: "parking", pts: [[0, 0], [40, 0], [40, 40], [0, 40]] }];
  const d = cam({ x: 10, y: 10 });
  assert.deepEqual(stopPlace(d, { zones }), ["Parking"]);                                  // no boundary/sides -> no "Front"
  assert.deepEqual(stopPlace(d, { zones, sides: { top: { label: "Main St" } } }), ["Main St", "Parking"]);
  assert.deepEqual(stopPlace(d, {}), []);
  assert.deepEqual(stopPlace(null, {}), []);
});

test("source guards: walkthrough reuses survey2-model + shared helpers, honours reduced motion, visualize passes devices", () => {
  const wk = src("../app/project/[accessId]/system-walkthrough.jsx");
  assert.ok(wk.includes('from "../../../lib/walkthrough-stops"'));
  assert.ok(wk.includes("SPK_COVERAGE"));
  assert.ok(wk.includes("prefers-reduced-motion"));
  assert.ok(wk.includes("swk2-strip"));
  const vz = src("../app/project/[accessId]/system-visualize.jsx");
  assert.ok(vz.includes("devices: f.devices"));
});
