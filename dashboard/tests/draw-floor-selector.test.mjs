// Floor selector inside the draw tool: the host sends the roster (iotFloors), a pick flushes the plan then posts iotDrawFloor.
// Single-file ES5 widgets: source-read the wiring, extract + run the pure roster helper, parse every inline script.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const has = (src, s, msg) => assert.ok(src.includes(s), msg || `missing: ${s}`);

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

test("draw tool: chip + menu markup is a labelled button with aria-expanded, outside the bottom dock", () => {
  has(draw, 'id="floorBtn"');
  has(draw, 'aria-expanded="false"');
  has(draw, 'aria-haspopup="listbox"');
  const dock = draw.indexOf('<div class="tbar" id="tbar">');
  assert.ok(draw.indexOf('id="floorSel"') > -1 && draw.indexOf('id="floorSel"') < dock, "selector must sit outside the .tbar dock");
  assert.ok(!draw.slice(dock, draw.indexOf("</script>", dock)).includes('id="floorBtn"'), "chip must not live in the dock");
});

test("draw tool listens for iotFloors from its parent only and renders the chip", () => {
  has(draw, '"iotFloors"');
  const i = draw.indexOf('m.type!=="iotFloors"');
  assert.ok(i > -1);
  const h = draw.slice(i - 80, draw.indexOf("});", i) + 3);
  assert.ok(h.includes("ev.source!==parent"), "listener must guard the sender");
  assert.ok(h.includes("renderFloorSel()"), "listener must render the chip");
  has(draw, '"Floor "+(_flIdx+1)', "pre-roster fallback label from FLOOR (never blank)");
  has(draw, "renderFloorSel();\n  $(\"mClean\")", "chip is rendered once at boot, before the roster arrives");
});

test("draw tool: a pick flushPlan()s BEFORE posting iotDrawFloor; current floor disabled; Escape/outside-click close", () => {
  const body = extractFn(draw, "pickFloor");
  const f = body.indexOf("flushPlan()"), p = body.indexOf('type:"iotDrawFloor"');
  assert.ok(f > -1 && p > -1 && f < p, "flushPlan() must precede the iotDrawFloor post");
  assert.ok(body.includes("closeLabel()"), "a half-typed room name is committed first");
  has(draw, "b.disabled=f.cur");
  has(draw, 'if($("floorMenu").classList.contains("on")){ closeFloorMenu();');
  has(draw, '!$("floorSel").contains(e.target)');
  assert.ok(!draw.includes("floorMenu\").innerHTML") && !body.includes("innerHTML"), "names go through textContent");
});

test("floorRoster(): sanitizes the host roster and marks this frame's floor", () => {
  const floorRoster = new Function(extractFn(draw, "floorRoster") + "\nreturn floorRoster;")();
  const r = floorRoster([{ i: 0, id: "a", name: "  Ground   floor " }, { i: 1, id: "b", name: "" }, null, { i: 2, id: null, name: "<b>x</b>" }], "b", 1);
  assert.deepEqual(r.map((x) => [x.i, x.name, x.cur]), [[0, "Ground floor", false], [1, "Floor 2", true], [2, "<b>x</b>", false]]);
  assert.deepEqual(floorRoster("nope", "", 0), []);
  assert.equal(floorRoster([{ i: 0, id: null, name: "A" }, { i: 1, id: null, name: "B" }], "", 1)[1].cur, true, "falls back to the index when no ids");
  assert.equal(floorRoster([{ i: 0, name: "x".repeat(200) }], "", 0)[0].name.length, 40);
});

test("host posts the iotFloors roster after iotPlanLoad (separate message) and handles iotDrawFloor with the sender guard", () => {
  has(survey, 'type:"iotFloors", floors:floors.map(function(f,i){ return {i:i, id:(f&&f.id)||null, name:(f&&f.name)||("Floor "+(i+1))}; }), cur:curFloor');
  const rd = survey.indexOf('if(m.type==="iotPlanReady")');
  const line = survey.slice(rd, survey.indexOf("\n", rd));
  assert.ok(line.indexOf('type:"iotPlanLoad"') > -1 && line.indexOf("postFloorRoster()") > line.indexOf('type:"iotPlanLoad"'), "roster is sent right after the plan load, in the ready handler");
  const k = survey.indexOf('m.type!=="iotDrawFloor"');
  assert.ok(k > -1);
  const h = survey.slice(k, survey.indexOf("});", k) + 3);
  assert.ok(h.includes("ev.source!==satFrame.contentWindow"), "sender must be the embedded draw tool");
  assert.ok(h.includes("frozen()"), "locked surveys never switch");
  const order = ["snapFloor()", "curFloor=i", "loadFloor(i)", "renderFloorTabs()", "queueSave()", "enterDraw()"].map((t) => h.indexOf(t));
  assert.ok(order.every((x) => x > -1) && order.every((x, n) => !n || x > order[n - 1]), "snapFloor -> curFloor -> loadFloor -> renderFloorTabs -> queueSave -> enterDraw, in order");
  assert.ok(h.includes("i<0||i>=floors.length"), "index range-checked");
});

test("the iotPlanLoad object literal is unchanged (no roster fields inside it)", () => {
  has(survey, 'postMessage({type:"iotPlanLoad", fid:fid, plan:(fl&&fl.plan)||null}, "*")');
});

test("inline scripts of both widgets still parse", () => {
  for (const src of [draw, survey]) {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, n = 0;
    while ((m = re.exec(src))) { if (/type="(?!text\/javascript)/.test(m[0].slice(0, m[0].indexOf(">")))) continue; new Function(m[1]); n++; }
    assert.ok(n > 0);
  }
});
