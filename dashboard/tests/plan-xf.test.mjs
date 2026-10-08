// Manual plan→aerial alignment transform (floor.planXf). The pure helpers are defined inline in the
// survey widget; extract them and verify the math: validation/clamping, the CSS string that drives
// #planWorld, and forward/inverse round-trips (so a pointer maps back to the exact plan coordinate at
// any translate/rotate/scale). Geometry-only, deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as lib from "../lib/plan-xf.js";

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

// ---- The shared lib (lib/plan-xf.js) must not drift from the widget's inline copy. The widget is static
// HTML (no bundler) so it inlines the helpers; assert the lib and the extracted inline functions agree on a
// sweep of inputs — the exporter composites hybrids from the lib, so a divergence would mis-place the plan.
test("lib/plan-xf.js matches the widget's inline validXf/xfIsId/xfCss/xfFwd/xfInv (no drift)", () => {
  const xfs = [null, {}, { tx: 5, ty: -3, s: 1.25, rot: 12 }, { tx: 200, ty: -999, s: 99, rot: 270 },
    { tx: -40, ty: 18, s: 0.05, rot: -360 }, { s: 3, rot: 45 }, { rot: 90 }, { tx: 10, ty: -6 }, { s: 1.5, rot: 37, tx: 7, ty: -2 }];
  for (const t of xfs) {
    assert.deepEqual(lib.validXf(t), xf.validXf(t), "validXf " + JSON.stringify(t));
    assert.equal(lib.xfIsId(t), xf.xfIsId(t), "xfIsId " + JSON.stringify(t));
    assert.equal(lib.xfCss(t), xf.xfCss(t), "xfCss " + JSON.stringify(t));
    for (const [px, py] of [[50, 50], [20, 80], [0, 0], [100, 100], [63.2, 41.7]]) {
      const a = lib.xfFwd(t, px, py), b = xf.xfFwd(t, px, py); close(a.x, b.x); close(a.y, b.y);
      const u = lib.xfInv(t, px, py), v = xf.xfInv(t, px, py); close(u.x, v.x); close(u.y, v.y);
    }
  }
});

test("xfMatrix/xfApplyPx: identity is identity; a square plate matches xfFwd; rotation is true pixel-space", () => {
  // Identity → the canvas affine is the identity matrix (±0 are equal here).
  const I = lib.xfMatrix(null, 800, 600);
  close(I.a, 1); close(I.b, 0); close(I.c, 0); close(I.d, 1); close(I.e, 0); close(I.f, 0);
  // Known value: xf={tx:10,ty:-6,s:2,rot:90}, W=H=1000, device pixel (600,500) → (600,640).
  const p = lib.xfApplyPx({ tx: 10, ty: -6, s: 2, rot: 90 }, 600, 500, 1000, 1000);
  close(p.x, 600); close(p.y, 640);
  // On a SQUARE plate, pixel-space projection equals xfFwd projected to pixels (no shear).
  for (const t of [{ tx: 7, ty: -2, s: 1.5, rot: 37 }, { rot: 90 }, { s: 2 }, { tx: 12 }]) {
    for (const [dx, dy] of [[60, 50], [10, 90], [0, 0], [100, 100]]) {
      const px = lib.xfApplyPx(t, dx / 100 * 1000, dy / 100 * 1000, 1000, 1000);
      const pc = lib.xfFwd(t, dx, dy);
      close(px.x, pc.x / 100 * 1000); close(px.y, pc.y / 100 * 1000);
    }
  }
  // The plate centre is the fixed point of rotate+scale (translate aside), at any aspect.
  const cc = lib.xfApplyPx({ s: 3, rot: 45 }, 400, 200, 800, 400); close(cc.x, 400); close(cc.y, 200);
});
