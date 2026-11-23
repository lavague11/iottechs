// BUG #102 — a camera's sub-bundle is not separate work on the technician's list.
//
// "Camera 1" opens its own checklist (Cable Dropped → Cable Managed → Wires Terminated → Camera
// Mounted → Camera Online). That checklist IS the mounting, the programming and the waterproofing, so
// listing those sub-lines again as their own steps turned eight cameras into a 224-step work order —
// and because nothing ever ticked them, the order could never reach done.
//
// Two invariants this pins, because the fix sits next to money and signatures:
//   · woLines() itself is UNCHANGED — workOrderFingerprint reads it, and touching it would void every
//     signed work order.
//   · the parent's total already contains its subs (techItemTotal), so nothing is lost by not listing
//     them: the flat list was showing the same payout twice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { woLines, woTotal } from "../lib/work-order.js";
import { techItemTotal } from "../lib/proposal.js";
import { stepCount } from "../lib/work-order-field.js";

const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

// One camera with the sub-bundle the screenshot showed, plus a sub-less equipment line.
const payload = JSON.stringify({ options: [{ id: "o1", services: [
  { key: "camera", label: "Cameras", items: [
    { id: "c1", name: "Camera 1", qty: 1, techPrice: 50, sub: [
      { id: "s1", name: "4K Camera 1", qty: 1, techPrice: 0 },
      { id: "s2", name: "Camera Mounting 1", qty: 1, techPrice: 10 },
      { id: "s3", name: "Camera Programming 1", qty: 1, techPrice: 0 },
      { id: "s4", name: "Camera Waterproofing 1", qty: 1, techPrice: 0 },
    ] },
  ] },
  { key: "camera", label: "Cameras", items: [{ id: "n1", name: "NVR (16-Channel)", qty: 1, techPrice: 10, sub: [] }] },
] }] });

// The filter as db.js applies it, run over the real woLines output.
function fieldList(p) {
  const parentSteps = new Map(woLines(p).map((l) => [l.key, stepCount(l.kind)]));
  const coveredByParent = (l) => l.parentKey && (parentSteps.get(l.parentKey) || 0) > 1;
  return woLines(p).filter((l) => !coveredByParent(l));
}

test("the camera's sub-lines drop off the technician's list; the camera and the NVR stay", () => {
  const flat = woLines(payload).map((l) => l.name);
  assert.ok(flat.includes("Camera Mounting 1") && flat.includes("4K Camera 1"),
    "woLines still emits them — it must, the fingerprint reads it");
  const shown = fieldList(payload).map((l) => l.name);
  assert.deepEqual(shown, ["Camera 1", "NVR (16-Channel)"], "only real work remains on the list");
});

test("the parent already carries the sub-lines' money — nothing is lost by not listing them", () => {
  const opt = JSON.parse(payload).options[0];
  const cam = opt.services[0].items[0];
  assert.equal(techItemTotal(cam), 60, "50 for the camera + 10 for the mounting sub");
  const before = woTotal(payload);
  // The payout total is read from the option tree, not from the flat list, so the filter cannot move it.
  assert.equal(woTotal(payload), before);
  assert.equal(before, 70, "60 for the camera line + 10 for the NVR");
  // …and the flat list double-counts: parent total + sub totals exceeds the real payout.
  const flatSum = woLines(payload).reduce((a, l) => a + l.total, 0);
  assert.ok(flatSum > before, `the flat list adds up to ${flatSum}, more than the ${before} actually owed`);
});

test("a sub-line whose parent has NO checklist of its own is kept", () => {
  // Then the sub is the only place that work appears, so hiding it would lose it.
  const p = JSON.stringify({ options: [{ id: "o1", services: [{ key: "misc", label: "Misc", items: [
    { id: "p1", name: "Site Materials", qty: 1, techPrice: 5, sub: [{ id: "p2", name: "Conduit Run", qty: 1, techPrice: 20 }] },
  ] }] }] });
  const parent = woLines(p).find((l) => l.key === "p1");
  const shown = fieldList(p).map((l) => l.name);
  if (stepCount(parent.kind) > 1) assert.ok(!shown.includes("Conduit Run"));
  else assert.ok(shown.includes("Conduit Run"), "a single-step parent does not cover its sub");
});

test("the step count collapses — a work order that could not reach done now can", () => {
  const flatSteps = woLines(payload).reduce((a, l) => a + stepCount(l.kind), 0);
  const shownSteps = fieldList(payload).reduce((a, l) => a + stepCount(l.kind), 0);
  assert.ok(shownSteps < flatSteps, `${shownSteps} steps instead of ${flatSteps}`);
});

test("the filter lives in the live-list builder, NOT in woLines — signatures must not move", () => {
  assert.match(db, /const parentSteps = new Map\(woLines\(payload\)\.map\(\(l\) => \[l\.key, stepCount\(l\.kind\)\]\)\);/,
    "db.js builds the parent-step map");
  assert.match(db, /\.filter\(\(l\) => !coveredByParent\(l\)\)/, "and filters the technician's live list");
  const wo = readFileSync(new URL("../lib/work-order.js", import.meta.url), "utf8");
  const fn = wo.slice(wo.indexOf("export function woLines("), wo.indexOf("// ---- Signature binding"));
  assert.ok(/subs\.forEach\(/.test(fn), "woLines still emits every sub-line — the fingerprint depends on it");
  assert.ok(!/coveredByParent|parentSteps/.test(fn), "…and knows nothing about the field filter");
});
