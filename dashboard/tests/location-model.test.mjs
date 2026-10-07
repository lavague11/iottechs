// Device LOCATION model: identity (name/tag) ≠ location (locName "Dining 1") ≠ placement (inside/outside).
// Deterministic, geometry-only. Extract the pure resolver rmDevCtx and run it on a synthetic plan; plus
// source guards for the stable-sequence reconciler, the canvas label, persistence, and the camera-suggestion swap.
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
const ZT = survey.slice(survey.indexOf("var ZONE_TYPES="), survey.indexOf("var ZONE_KEYS="));
const api = new Function(`var SUG_HALF=13; ${ZT}
  ${extractFn("sugOk")}\n${extractFn("zTypeLabel")}\n${extractFn("rmDevCtx")}
  return { rmDevCtx, zTypeLabel };`)();

const VB = { x0: 0, y0: 0, vw: 400, vh: 400 };   // plate 0..100% → plan-px 0..400; HALF=13
const cell = (c, r) => ({ x: (c * 13 + 6.5) / 400 * 100, y: (r * 13 + 6.5) / 400 * 100 });   // a device centred in cell (c,r)
const range = (c0, c1, r0, r1) => { const a = []; for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) a.push(c + "," + r); return a; };
const DINING = range(1, 4, 1, 3), KITCHEN = range(6, 8, 1, 3);
const PLAN = { rooms: [{ cells: DINING, label: "Dining" }, { cells: KITCHEN, label: "Kitchen" }], cells: DINING.concat(KITCHEN), zoneCells: { driveway: range(1, 4, 10, 12), site: range(0, 20, 0, 20) } };
const o = { vb: VB }, f = { plan: PLAN };

test("a camera inside a room → inside + the room's display name as the base", () => {
  const r = api.rmDevCtx(cell(2, 2), f, o);
  assert.equal(r.placementType, "inside");
  assert.equal(r.roomIdx, 0);
  assert.equal(r.base, "Dining");
  assert.equal(api.rmDevCtx(cell(7, 2), f, o).base, "Kitchen");
});

test("a camera in an exterior zone → outside + the zone name (site/interior/exterior are not names)", () => {
  const r = api.rmDevCtx(cell(2, 11), f, o);
  assert.equal(r.placementType, "outside");
  assert.equal(r.roomIdx, -1);
  assert.equal(r.base, "Driveway");
});

test("wall-mount tolerance: an anchor one cell outside a room still resolves to that room", () => {
  const r = api.rmDevCtx(cell(5, 2), f, o);   // col 5 is between Dining (≤4) and Kitchen (≥6); neighbour of both
  assert.equal(r.placementType, "inside");
  assert.ok(r.roomIdx === 0 || r.roomIdx === 1, "picks an adjacent room, not nothing");
});

test("a camera with no plan / off every structure → no base, outside", () => {
  assert.deepEqual(api.rmDevCtx(cell(2, 2), {}, o), { placementType: "", roomIdx: -1, base: "" });
  const far = api.rmDevCtx({ x: 99, y: 2 }, f, o);   // far right, not in a room/building/zone
  assert.equal(far.base, "");
});

test("identity is never written; the reconciler writes only location fields with a STABLE sequence", () => {
  const rc = extractFn("reconcileLocations");
  assert.ok(!/\bd\.name\s*=/.test(rc), "reconcileLocations never changes the device's identity name");
  assert.ok(rc.includes("d.locName=nName") && rc.includes("d.placementType=npt") && rc.includes("d.locSeq=nSeq"), "writes the location fields");
  assert.ok(rc.includes("d.locKey===k && +d.locSeq>0){ nSeq=+d.locSeq;") && rc.includes("nSeq=(max[k]||0)+1"), "keeps its number in place, else takes the next one (no reshuffle)");
  assert.ok(survey.includes('ct.base+" "+nSeq') && !survey.includes('ct.base+" Camera "'), "location name is '<Room/Zone> <n>' (no 'Camera' word)");
});

test("the map label prefers the location name; identity is the fallback", () => {
  assert.ok(survey.includes("lab.textContent=cap(d.locName||(d.name&&d.name.trim())||d.tag)"), "canvas emphasizes WHERE");
  assert.ok(survey.includes('function sugShown(d){ if(d && d.k==="cam") return ""'), "camera suggestion row yields to the auto location name");
  assert.ok(survey.includes('locName:d.locName||"",placementType:d.placementType||""'), "location + placement persist");
  assert.ok(survey.includes('locName:d.locName||"", placementType:d.placementType||"", cone:'), "the roster push to the page carries location + placement");
});
