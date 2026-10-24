// Phase 2.5 / Phase-4 groundwork — the reusable DEVICE RESOLVER. Proves it resolves natural references to a
// STABLE device id (code/ordinal, name, location, spatial), asks to clarify when ambiguous, and NEVER guesses
// (unknown → none). Devices are injected in the shape surveyDevices() emits (survey2-model), so this is pure.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDevice, candidateView } from "../lib/device-resolver.js";
import { parseSurveyFloors, surveyDevices } from "../lib/survey2-model.js";

const DEVICES = [
  { id: "d1", k: "cam", kindName: "Camera", code: "C1", identity: "Camera 1", label: "Lobby 1", loc: "Lobby", floor: 0, floorName: "Floor 1", x: 20, y: 30 },
  { id: "d2", k: "cam", kindName: "Camera", code: "C2", identity: "Camera 2", label: "Front Entrance", loc: "Front Entrance", floor: 0, floorName: "Floor 1", x: 82, y: 68 },
  { id: "d3", k: "cam", kindName: "Camera", code: "C3", identity: "Camera 3", label: "Dining 1", loc: "Dining", floor: 0, floorName: "Floor 1", x: 15, y: 75 },
  { id: "d4", k: "spk", kindName: "Speaker", code: "S1", identity: "Speaker 1", label: "Dining 2", loc: "Dining", floor: 0, floorName: "Floor 1", x: 50, y: 50 },
];

test("ordinal + kind: 'camera 3' → the camera whose stable CODE is C3 (its id, never a position)", () => {
  const r = resolveDevice("flag camera 3", DEVICES);
  assert.equal(r.device?.id, "d3");
});

test("exact code token: 'c2' → that device", () => {
  assert.equal(resolveDevice("c2 is misaimed", DEVICES).device?.id, "d2");
});

test("location name: 'the front entrance camera' → the camera at Front Entrance", () => {
  assert.equal(resolveDevice("the front entrance camera", DEVICES).device?.id, "d2");
});

test("the owner's sentence resolves to the exact device", () => {
  // "I'm not sure we need that camera near the entrance" → the entrance camera (d2), by location.
  assert.equal(resolveDevice("I'm not sure we need that camera near the entrance", DEVICES).device?.id, "d2");
});

test("spatial: unique region resolves; ambiguous region asks to clarify (never guesses)", () => {
  // Only d2 is on the right (x≥60).
  assert.equal(resolveDevice("the camera on the right", DEVICES).device?.id, "d2");
  // Two cameras are on the left (d1 x20, d3 x15) → clarify, not a guess.
  const left = resolveDevice("the camera on the left", DEVICES);
  assert.ok(left.candidates && left.candidates.length === 2, "left is ambiguous → candidates");
  assert.deepEqual(left.candidates.map((c) => c.id).sort(), ["d1", "d3"]);
});

test("single device of a kind resolves with no other cue; multiple of a kind → clarify", () => {
  assert.equal(resolveDevice("the speaker", DEVICES).device?.id, "d4");   // only one speaker
  const cams = resolveDevice("the camera", DEVICES);                       // three cameras, no discriminator
  assert.ok(cams.candidates && cams.candidates.length === 3);
});

test("unknown / missing → none; empty list → none; no discriminator → none (NEVER guess)", () => {
  assert.deepEqual(resolveDevice("the camera", []), { none: true });
  assert.deepEqual(resolveDevice("the microwave", DEVICES), { none: true });       // no such kind, no match
  assert.deepEqual(resolveDevice("please flag it", DEVICES), { none: true });      // nothing to go on
  // A kind that isn't present at all → none (never invents a type).
  assert.deepEqual(resolveDevice("the keypad", DEVICES), { none: true });
});

test("never-guess: a device number that matches NO code clarifies (no positional fallback)", () => {
  // Codes are per-group and non-contiguous: NVR=C1, cameras C2/C3. "camera 1" matches no CAMERA code →
  // must clarify among the cameras, NOT return the first camera by position.
  const mixed = [
    { id: "n1", k: "nvr", kindName: "NVR", code: "C1", identity: "NVR 1", label: "Closet", loc: "Closet", floor: 0, floorName: "Floor 1", x: 10, y: 10 },
    { id: "c2", k: "cam", kindName: "Camera", code: "C2", identity: "Camera 2", label: "Lobby", loc: "Lobby", floor: 0, floorName: "Floor 1", x: 30, y: 30 },
    { id: "c3", k: "cam", kindName: "Camera", code: "C3", identity: "Camera 3", label: "Dining", loc: "Dining", floor: 0, floorName: "Floor 1", x: 70, y: 70 },
  ];
  const r = resolveDevice("flag camera 1 as damaged", mixed);
  assert.ok(r.candidates && r.candidates.length === 2, "camera 1 (no C-camera match) → clarify, not a guess");
  assert.ok(!r.device);
});

test("quantity is not an ordinal: '2 cameras' doesn't resolve to camera #2", () => {
  // "2 cameras" is a count, not device #2 → clarify among the cameras rather than silently pick C2.
  const r = resolveDevice("flag 2 cameras as damaged", DEVICES);
  assert.ok(r.candidates && r.candidates.length === 3);
  assert.ok(!r.device);
});

test("REAL survey blob (no per-device id persisted) → surveyDevices yields non-null ids so the resolver works", () => {
  // Shape mirrors the widget's stripDevs() output: NO `id`, NO `tag`; cameras carry a stable cid, others don't.
  // Before the id fallback (d.id ?? cid ?? code), every id was undefined and resolveDevice's `d.id != null`
  // filter emptied the list — silently breaking coverage / raise_issue / feedback on real data.
  const blob = { floors: [{ name: "Floor 1", bg: "data:image/x,x", devices: [
    { k: "cam", x: 20, y: 30, aimed: true, aim: 45, fov: 30, range: 40, name: "", locName: "Lobby", cid: "cAAA111" },
    { k: "cam", x: 80, y: 70, aimed: true, aim: 92, fov: 30, range: 40, name: "", locName: "Front Entrance", cid: "cBBB222" },
    { k: "spk", x: 50, y: 50, locName: "Dining" },
  ] }] };
  const devices = surveyDevices(parseSurveyFloors(blob));
  assert.equal(devices.length, 3);
  assert.ok(devices.every((d) => d.id != null), "every device has a non-null id");
  assert.equal(devices[0].id, "cAAA111");              // camera → its stable cid
  assert.equal(devices[2].id, devices[2].code);        // non-camera → deterministic code
  assert.equal(resolveDevice("the front entrance camera", devices).device?.id, "cBBB222");
  assert.equal(resolveDevice("camera 2", devices).device?.id, "cBBB222");   // 2nd camera (code C2) → cid cBBB222
  assert.ok(resolveDevice("the speaker", devices).device);
});

test("candidateView gives a human label for a clarify prompt (code + kind + location)", () => {
  const v = candidateView(DEVICES[1]);
  assert.equal(v.id, "d2");
  assert.match(v.display, /C2 Camera \(Front Entrance\)/);
});
