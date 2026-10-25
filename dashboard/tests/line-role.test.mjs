// Endpoint vs infrastructure classification — number badges mean "camera/speaker #N" (endpoints); supporting
// hardware (NVR/amp/display/switch/panel) is infrastructure (icon badge, no number). Pure + canonical-metadata
// first (sub-items → camera endpoint; else baseName, falling back to name).
import test from "node:test";
import assert from "node:assert/strict";
import { lineRole, infraKindOf } from "../lib/proposal.js";

test("camera install blocks (with sub-items) are endpoints", () => {
  assert.equal(lineRole({ name: "Full Camera Install", sub: [{ name: "Camera" }] }), "endpoint");
  assert.equal(lineRole({ name: "Entrance", sub: [{ name: "Camera" }, { name: "Cat6 Drop" }] }), "endpoint");
});

test("supporting hardware is infrastructure (by baseName, then name)", () => {
  for (const n of ["NVR (16-Channel)", "NVR (8-Channel)", "Amplifier (4-Zone)", "Display", "Monitor", "PoE Switch", "Door Controller", "Control Panel", "Patch Panel", "Storage Drive"])
    assert.equal(lineRole({ name: n }), "infrastructure", n);
  // baseName wins over a renamed display name.
  assert.equal(lineRole({ baseName: "NVR (16-Channel)", name: "Main Recorder" }), "infrastructure");
});

test("endpoints without sub-items still read as endpoints", () => {
  for (const n of ["Studio 1A Speaker — FP2", "Card Reader", "Motion Sensor", "Keypad", "Glass-Break Sensor", "Entrance"])
    assert.equal(lineRole({ name: n }), "endpoint", n);
});

test("a custom-named item (__custom__) is classified by its display name, not the sentinel", () => {
  assert.equal(lineRole({ baseName: "__custom__", name: "Customer Monitor" }), "infrastructure");
  assert.equal(lineRole({ baseName: "__custom__", name: "Panic Button" }), "endpoint");
});

test("infraKindOf maps to the right glyph", () => {
  assert.equal(infraKindOf("nvr"), "nvr");
  assert.equal(infraKindOf("NVR (16-Channel)"), "nvr");
  assert.equal(infraKindOf("disp"), "display");
  assert.equal(infraKindOf("Display"), "display");
  assert.equal(infraKindOf("Amplifier (4-Zone)"), "amp");
  assert.equal(infraKindOf("PoE Switch"), "switch");
  assert.equal(infraKindOf("Control Panel"), "panel");
  assert.equal(infraKindOf("Something Else"), "generic");
});
