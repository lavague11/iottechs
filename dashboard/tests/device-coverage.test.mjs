// Phase 4 (read) — device coverage explanation. Pure: proves the sentence states ONLY stored survey facts
// (aim/fov/range for a cone, radius for a speaker), reports an unaimed camera honestly, and omits missing
// numbers rather than inventing them.
import test from "node:test";
import assert from "node:assert/strict";
import { describeCoverage, coverageFacts, deviceName } from "../lib/device-coverage.js";

const AIMED_CAM = { id: "d2", k: "cam", kindName: "Camera", code: "C2", loc: "Front Entrance", label: "Front Entrance", floor: 0, floorName: "Floor 1", placementType: "outside", cone: true, aimed: true, aim: 92, fov: 30, range: 40 };
const UNAIMED_CAM = { id: "d5", k: "cam", kindName: "Camera", code: "C5", loc: "Stockroom", floor: 0, floorName: "Floor 1", cone: true, aimed: false, aim: 0, fov: 30, range: 40 };
const SPEAKER = { id: "s1", k: "spk", kindName: "Speaker", code: "S1", loc: "Dining", floor: 0, floorName: "Floor 1", ring: true, range: 18 };

test("describeCoverage states aim / FOV / reach for an aimed camera (survey facts only)", () => {
  const s = describeCoverage(AIMED_CAM);
  assert.match(s, /C2 Camera is on Floor 1 in Front Entrance \(outside\)/);
  assert.match(s, /aimed about 92°/);
  assert.match(s, /30° field of view/);
  assert.match(s, /~40 ft/);
});

test("an unaimed camera is reported honestly (no invented direction)", () => {
  const s = describeCoverage(UNAIMED_CAM);
  assert.match(s, /not yet aimed/);
  assert.doesNotMatch(s, /\d+° field of view/);   // no coverage claimed when not aimed
});

test("a speaker describes its radius; name falls back sensibly", () => {
  assert.match(describeCoverage(SPEAKER), /covering roughly 18 ft around it/);
  assert.equal(deviceName({ identity: "Lobby amp" }), "Lobby amp");
  assert.equal(describeCoverage(null), null);
});

test("coverageFacts returns nulls for unstored values (never fabricates a default)", () => {
  const f = coverageFacts(UNAIMED_CAM);
  assert.equal(f.aimed, false);
  assert.equal(f.aimDeg, null);            // aim 0 + not aimed → null, not 0
  assert.equal(f.coverageKind, "cone");
  const sf = coverageFacts(SPEAKER);
  assert.equal(sf.coverageKind, "radius");
  assert.equal(sf.rangeFt, 18);
  assert.equal(sf.fovDeg, null);           // a speaker has no FOV
});
