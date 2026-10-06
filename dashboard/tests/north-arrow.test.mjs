// North arrow (node --test): the floor's persisted capture transform carries north through the survey
// model; the PDF export and the walkthrough draw it only when known; the angle convention is the shared helper's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSurveyFloors } from "../lib/survey2-model.js";
import { northArrowAngle } from "../lib/site-transform.js";

const BG = "data:image/png;base64,AAA";
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("parseSurveyFloors carries aerial.northDeg; absent/non-numeric -> null; bg-less floors dropped", () => {
  const out = parseSurveyFloors({ floors: [
    { name: "A", bg: BG, aerial: { northDeg: -13 }, devices: [] },
    { name: "B", bg: BG, aerial: { northDeg: "20", rotationDeg: 7 }, devices: [] },
    { name: "C", bg: BG, devices: [] },
    { name: "D", bg: BG, aerial: { northDeg: "abc" }, devices: [] },
    { name: "E", aerial: { northDeg: 10 }, devices: [] },
  ] });
  assert.equal(out.length, 4);
  assert.deepEqual(out[0].aerial, { northDeg: -13, rotationDeg: 0 });
  assert.deepEqual(out[1].aerial, { northDeg: 20, rotationDeg: 7 });
  assert.equal(out[2].aerial, null);
  assert.equal(out[3].aerial, null);
});

test("source guards: export, walkthrough and every caller wire the north arrow", () => {
  const exp = src("../lib/survey2-export.js");
  assert.ok(exp.includes('import { northArrowAngle } from "./site-transform.js"'));
  assert.ok(exp.includes("f.aerial"));
  const wk = src("../app/project/[accessId]/system-walkthrough.jsx");
  assert.ok(wk.includes("northArrowAngle"));
  assert.ok(wk.includes("swk2-north"));
  for (const p of ["proposal-customer-view", "system-planner", "system-visualize"]) {
    assert.ok(src(`../app/project/[accessId]/${p}.jsx`).includes("aerial: f.aerial || null"), p);
  }
});

test("convention: an up-drawn arrow turns with northDeg (clockwise-positive)", () => {
  assert.equal(northArrowAngle(-13), -13);
});
