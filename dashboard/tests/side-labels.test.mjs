// Phase 4.4 — exterior side labels (Hybrid-only edge chips). Single-file ES5 widget: extract + run the pure helpers, source-read the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}
const line = (name) => { const m = new RegExp("^\\s*var " + name + "=.*$", "m").exec(survey); assert.ok(m, "missing var " + name); return m[0]; };

const helpers = new Function(
  line("SIDE_KEYS") + "\n" + line("SIDE_PRESETS") + "\n" + extractFn(survey, "sideType") + "\n" + extractFn(survey, "defaultSides") + "\n" + extractFn(survey, "sidesOf") +
  "\nreturn {SIDE_PRESETS,sideType,defaultSides,sidesOf};"
)();

test("4.4 defaultSides / sidesOf: Front, Right, Rear, Left; partial or old records merge over defaults", () => {
  const d = helpers.defaultSides();
  assert.deepEqual(d, { top: { label: "Front", type: "front" }, right: { label: "Right", type: "right" }, bottom: { label: "Rear", type: "rear" }, left: { label: "Left", type: "left" } });
  assert.deepEqual(helpers.sidesOf({}), d);
  assert.deepEqual(helpers.sidesOf(null), d);
  const m = helpers.sidesOf({ sides: { right: { label: "Street", type: "street" }, left: { label: "  ", type: "x" }, top: "junk" } });
  assert.equal(m.right.label, "Street"); assert.equal(m.right.type, "street");
  assert.equal(m.left.label, "Left", "blank label falls back to default");
  assert.equal(m.top.label, "Front", "malformed entry falls back to default");
  assert.equal(m.bottom.label, "Rear");
  assert.deepEqual(Object.keys(m), ["top", "right", "bottom", "left"], "all four sides always present");
});

test("4.4 four .sidechip buttons with the four data-side values live in #working", () => {
  const w = survey.slice(survey.indexOf('id="working"'));
  const sides = [...w.matchAll(/<button class="sidechip" data-side="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(sides, ["top", "right", "bottom", "left"]);
  assert.ok(survey.indexOf('class="sidechip"') > survey.indexOf('id="working"') && survey.indexOf('class="sidechip"') < survey.indexOf('class="ctxbar"'), "chips sit in #working (not the zoomed #scene)");
});

test("4.4 renderSides is called from renderView, gated on the resolved hybrid view", () => {
  const rv = extractFn(survey, "renderView");
  assert.ok(rv.includes('renderSides(cap && v==="hybrid")'), "gate expression");
  assert.ok(extractFn(survey, "renderSides").includes('style.display="none"'), "hidden when not shown");
});

test("4.4 sides carried through restore / createFloor / duplicateFloor and kept OFF snapFloor", () => {
  assert.ok(extractFn(survey, "createFloor").includes("sides:(from&&from.sides)?JSON.parse(JSON.stringify(from.sides)):null"), "createFloor deep-copies");
  assert.ok(extractFn(survey, "duplicateFloor").includes("sides:src.sides?JSON.parse(JSON.stringify(src.sides)):null"), "duplicateFloor deep-copies");
  assert.ok(/Object\.assign\(\{\}, f, \{[^\n]*sides:\(f\.sides&&typeof f\.sides==="object"\)\?f\.sides:null/.test(survey), "restore carries sides");
  assert.ok(!extractFn(survey, "snapFloor").includes("sides"), "snapFloor does not touch sides");
});

test("4.4 presets: 4 defaults + 7 extras; 'Side Yard' maps to type side-yard", () => {
  assert.deepEqual(helpers.SIDE_PRESETS, ["Front", "Right", "Rear", "Left", "Street", "Driveway", "Backyard", "Parking", "Side Yard", "Alley", "Loading"]);
  assert.equal(helpers.sideType("Side Yard"), "side-yard");
  assert.equal(helpers.sideType("Front"), "front");
});

test("4.4 frozen() disables editing: chip click handler + setSide guard, chips marked read-only", () => {
  assert.ok(survey.includes('c.addEventListener("click",function(e){ e.stopPropagation(); if(frozen()) return;'), "chip click guarded");
  assert.ok(extractFn(survey, "setSide").includes("if(frozen()) return;"), "setSide guarded");
  assert.ok(extractFn(survey, "renderSides").includes('c.classList.toggle("ro",ro)'), "read-only chips are not interactive");
  assert.ok(/\.sidechip\.ro\{[^}]*pointer-events:none/.test(survey), "ro chips ignore pointers");
});

test("4.4 retag writes label+type to the floor and persists", () => {
  const s = extractFn(survey, "setSide");
  assert.ok(s.includes("f.sides=sidesOf(f)") && s.includes("f.sides[side]={label:label,type:type||\"custom\"}") && s.includes("queueSave()") && s.includes("renderSides(true)"));
});
