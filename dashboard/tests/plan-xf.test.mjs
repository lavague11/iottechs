// Manual plan→aerial alignment transform (floor.planXf). The pure helpers are defined inline in the
// survey widget; extract them and verify the math: validation/clamping, the CSS string that drives
// #planWorld, and forward/inverse round-trips (so a pointer maps back to the exact plan coordinate at
// any translate/rotate/scale). Geometry-only, deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
function extractFn(name) {
  const start = survey.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing " + name);
  let i = survey.indexOf("{", survey.indexOf(")", start)), depth = 0, q = null;
  for (let j = i; j < survey.length; j++) { const c = survey[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return survey.slice(start, j + 1); }
  throw new Error("unbalanced " + name);
}
const xf = new Function(`${extractFn("validXf")}\n${extractFn("xfIsId")}\n${extractFn("xfCss")}\n${extractFn("xfFwd")}\n${extractFn("xfInv")}
  return { validXf, xfIsId, xfCss, xfFwd, xfInv };`)();
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("validXf: defaults to identity, clamps scale/translate, normalizes rotation", () => {
  assert.deepEqual(xf.validXf(null), { tx: 0, ty: 0, s: 1, rot: 0 });
  assert.deepEqual(xf.validXf({}), { tx: 0, ty: 0, s: 1, rot: 0 });
  assert.equal(xf.validXf({ s: 99 }).s, 5, "scale capped at 5");
  assert.equal(xf.validXf({ s: 0 }).s, 0.2, "scale floored at 0.2");
  assert.equal(xf.validXf({ tx: 500 }).tx, 100, "translate clamped to ±100");
  assert.equal(xf.validXf({ rot: 270 }).rot, -90, "rotation normalized to (-180,180]");
  assert.equal(xf.validXf({ rot: -360 }).rot, 0);
  assert.deepEqual(xf.validXf({ tx: NaN, ty: "x", s: undefined, rot: Infinity }), { tx: 0, ty: 0, s: 1, rot: 0 });
});

test("xfIsId: only a true identity is identity", () => {
  assert.equal(xf.xfIsId(null), true);
  assert.equal(xf.xfIsId({ tx: 0, ty: 0, s: 1, rot: 0 }), true);
  assert.equal(xf.xfIsId({ tx: 0.5 }), false);
  assert.equal(xf.xfIsId({ rot: 2 }), false);
  assert.equal(xf.xfIsId({ s: 1.2 }), false);
});

test("xfCss: the CSS string matches translate→rotate→scale about the centre", () => {
  assert.equal(xf.xfCss({ tx: 5, ty: -3, s: 1.25, rot: 12 }), "translate(5%,-3%) rotate(12deg) scale(1.25)");
  assert.equal(xf.xfCss(null), "translate(0%,0%) rotate(0deg) scale(1)");
});

test("xfFwd/xfInv: round-trip is identity at every translate/rotate/scale", () => {
  const cases = [{ tx: 0, ty: 0, s: 1, rot: 0 }, { tx: 10, ty: -8, s: 1, rot: 0 }, { tx: 0, ty: 0, s: 2, rot: 0 },
    { tx: 0, ty: 0, s: 1, rot: 90 }, { tx: 0, ty: 0, s: 1, rot: 180 }, { tx: 5, ty: 7, s: 1.5, rot: 37 }];
  for (const t of cases) for (const [px, py] of [[50, 50], [20, 80], [0, 0], [100, 100], [63.2, 41.7]]) {
    const s = xf.xfFwd(t, px, py), back = xf.xfInv(t, s.x, s.y);
    close(back.x, px); close(back.y, py);
  }
});

test("xfFwd: the plate centre is the fixed point of rotation+scale; translate shifts it", () => {
  // centre maps to centre under pure rotate/scale
  let c = xf.xfFwd({ s: 3, rot: 45 }, 50, 50); close(c.x, 50); close(c.y, 50);
  // +10% translate moves the centre by +10
  c = xf.xfFwd({ tx: 10, ty: -6 }, 50, 50); close(c.x, 60); close(c.y, 44);
  // 90° rotation: a point 10 right of centre goes to 10 below centre (screen y down)
  const p = xf.xfFwd({ rot: 90 }, 60, 50); close(p.x, 50); close(p.y, 60);
});
