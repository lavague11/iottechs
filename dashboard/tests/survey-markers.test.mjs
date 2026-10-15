// Survey PDF markers: small-by-default icons + non-overlapping name labels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyScene } from "../lib/survey2-model.js";

test("marker radius is small by default (no longer oversized on the PDF)", () => {
  const floors = [{ name: "F1", bg: "x", devices: [{ k: "cam", x: 50, y: 50, aim: 90, fov: 60, name: "A" }] }];
  const s = surveyScene(floors, 0, 1600, 900, { dense: 7 });
  assert.ok(s.r <= 14 && s.r >= 10, `small marker radius for a 1600px export, got ${s.r}`);
  // was Math.max(14, 0.011*maxDim) → 18 for 1600; now Math.max(11, 0.008*maxDim) → ~13
});

test("export declutters NAME LABELS (not just discs) so clustered cameras don't overlap", () => {
  const ex = readFileSync(new URL("../lib/survey2-export.js", import.meta.url), "utf8");
  assert.ok(ex.includes("Layer 4 — name tags, placed so a chip never overlaps another chip OR a marker disc"), "label declutter pass present");
  assert.ok(ex.includes("const hits = (rc) => discRects.some((d) => ov(rc, d)) || placedL.some((p) => ov(rc, p));"), "labels avoid discs AND other labels");
  assert.ok(ex.includes("// leader line from the disc to the nearest chip edge"), "moved labels get a leader line");
});

test("planner default icon size is Small", () => {
  const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
  assert.ok(/var ISZ=20,/.test(survey), "ISZ defaults to 20 (Small)");
  assert.ok(survey.includes("var ISZ_STEPS=[20,28,40]"), "S/M/L steps unchanged");
});
