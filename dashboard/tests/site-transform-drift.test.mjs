// Drift guard: the static widgets inline copies of lib/site-transform.js helpers (they can't import).
// These tests pin the inline text and prove numeric parity with the library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { norm, northArrowAngle, gridBoxFeet } from "../lib/site-transform.js";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

test("survey inlines norm() and northArrowAngle() with the library's formulas", () => {
  assert.ok(survey.includes("((deg + 180) % 360 + 360) % 360 - 180"), "norm formula");
  assert.ok(survey.includes("return norm((+aerialNorthDeg || 0) + (+planRotationDeg || 0));"), "northArrowAngle body");
});

test("survey north arrow is wired into fitScene and loadFloor, shown only with a finite northDeg", () => {
  assert.ok(survey.includes('id="northArrow"'), "#northArrow element exists");
  const fit = survey.slice(survey.indexOf("function fitScene()"), survey.indexOf("function loadFloor("));
  const load = survey.slice(survey.indexOf("function loadFloor("), survey.indexOf("function loadFloor(") + 2500);
  assert.ok(fit.includes("renderNorthArrow()"), "fitScene renders the arrow");
  assert.ok(load.includes("renderNorthArrow()"), "loadFloor renders the arrow");
  assert.ok(survey.includes("curFloorAerial && Number.isFinite(+curFloorAerial.northDeg)"), "gated on finite northDeg");
  assert.ok(survey.includes('"rotate("+northArrowAngle(curFloorAerial.northDeg)+"deg)"'), "rotates by northArrowAngle");
});

test("draw tool inlines gridBoxFeet() with the library's formula", () => {
  assert.ok(draw.includes("(fullPx * metersPerPx) / M_PER_FT : 0"), "gridBoxFeet formula");
  assert.ok(draw.includes("function gridBoxFeet(metersPerPx, fullPx)"), "gridBoxFeet signature");
});

test("inline survey helpers are numerically identical to the library", () => {
  const normSrc = survey.match(/function norm\(deg\)\{[^\n]*?\}\s*\n/)[0];
  const arrowSrc = survey.match(/function northArrowAngle\([^)]*\)\{[^\n]*\}\s*\n/)[0];
  const inline = new Function(`${normSrc}\n${arrowSrc}\nreturn { norm, northArrowAngle };`)();
  for (const d of [-13, 13, 193, 540, 0, -200, 359.5]) {
    assert.equal(inline.norm(d), norm(d), `norm(${d})`);
    assert.equal(inline.northArrowAngle(d), northArrowAngle(d), `northArrowAngle(${d})`);
    assert.equal(inline.northArrowAngle(d, 30), northArrowAngle(d, 30), `northArrowAngle(${d}, 30)`);
  }
  assert.equal(inline.northArrowAngle(undefined), northArrowAngle(undefined));
});

test("inline draw gridBoxFeet is numerically identical to the library (FULL = 26)", () => {
  const src = draw.match(/function gridBoxFeet\([^)]*\)\s*\{[^\n]*\}\s*\n/)[0];
  const M_PER_FT = 0.3048, FULL = 26;
  const inline = new Function("M_PER_FT", "FULL", `${src}\nreturn gridBoxFeet;`)(M_PER_FT, FULL);
  for (const m of [0.021, 0.05, 0.5, 0, -1]) assert.equal(inline(m), gridBoxFeet(m, 26), `gridBoxFeet(${m})`);
  assert.equal(inline(0.021, 40), gridBoxFeet(0.021, 40));
  assert.ok(/var FULL=26/.test(draw), "draw FULL stays 26 (library FULL_PX mirror)");
});
