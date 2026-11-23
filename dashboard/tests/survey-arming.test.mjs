// D2 — an armed tool must not outlive the placing.
//
// Arming deliberately survives consecutive canvas taps (eight cameras in eight taps). It must NOT
// survive a move, a delete, a rename, an undo or a right-click: staying armed through those is how a
// mis-aimed click silently drops a device. Observed in Group 1 testing — a stale click added
// IC7 / Camera 6 while a camera had been armed several actions earlier.
//
// These run the widget's real arm/disarm/placeAt (docs/survey-rules.md, "The test rule").
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

// arm + disarm + placeAt, wired together over stubs, so "is it still armed?" is answered by the
// real code and "does a tap place something?" is answered by the real placeAt.
function tool() {
  const S = { armedK: null, added: [], angleMode: false, eraseMode: false, rooms: 0, classes: new Set() };
  return new Function("S", `
    var armedK=null, angleMode=false, eraseMode=false, regionMode=false, aligning=false, routing=false;
    function frozen(){ return false; }
    function setAngleMode(v){ angleMode=v; } function setEraseMode(v){ eraseMode=v; }
    function cat(k){ return { k:k, name:"Camera" }; }
    function iconOf(){ return "<svg></svg>"; }
    var PLUS_SVG="+";
    var work={ classList:{ toggle:function(n,on){ if(on) S.classes.add(n); else S.classes.delete(n); } } };
    var devMenu={ querySelectorAll:function(){ return []; }, classList:{ remove:function(){} } };
    var document={ getElementById:function(){ return { innerHTML:"" }; } };
    function renderRooms(){ S.rooms++; }
    function planPctFromClient(cx,cy){ return { x:cx/10, y:cy/10 }; }
    function addDevice(k,x,y){ S.added.push({ k:k, x:x, y:y }); }
    ${extractFn("disarm")}
    ${extractFn("arm")}
    ${extractFn("placeAt")}
    return {
      arm:arm, disarm:disarm, tap:placeAt,
      armed:function(){ return armedK; }, added:function(){ return S.added; },
      armedClass:function(){ return S.classes.has("arming"); }
    };
  `)(S);
}

test("arming survives consecutive taps — eight cameras in eight taps", () => {
  const t = tool();
  t.arm("cam");
  for (let i = 0; i < 8; i++) t.tap(100 + i * 10, 200);
  assert.equal(t.added().length, 8, "every tap placed one");
  assert.equal(t.armed(), "cam", "and the tool is still armed for the next one");
});

test("THE BUG: after a non-placement action, a stray tap places NOTHING", () => {
  const t = tool();
  t.arm("cam");
  t.tap(100, 200);                       // a real placement
  assert.equal(t.added().length, 1);
  t.disarm();                            // …then a move / delete / undo / right-click happens
  assert.equal(t.armed(), null, "the tool disarmed");
  t.tap(900, 400);                       // the stray click that used to drop IC7 / Camera 6
  assert.equal(t.added().length, 1, "no device was added by the stray tap");
});

test("arm toggles its visible state, so you can always see you are armed", () => {
  const t = tool();
  assert.equal(t.armedClass(), false);
  t.arm("cam");
  assert.equal(t.armedClass(), true, "the canvas carries the arming class");
  t.disarm();
  assert.equal(t.armedClass(), false, "and drops it again");
});

test("disarm on an unarmed tool is a no-op", () => {
  const t = tool();
  t.disarm(); t.disarm();
  assert.equal(t.armed(), null);
  assert.equal(t.armedClass(), false);
});

test("WIRED FOR REAL: deleting a device disarms, so the next tap places nothing", () => {
  // The whole chain executed — arm, place, removeDevice, tap — with no test-side disarm() call.
  // This is what makes the wiring itself testable rather than source-matched.
  const S = { added: [], devices: [], routes: [] };
  const api = new Function("S", `
    var armedK=null, angleMode=false, eraseMode=false, regionMode=false, aligning=false, routing=false;
    var devices=S.devices, floors=[{ routes:S.routes }], curFloor=0, selId=null, delStash=[];
    function frozen(){ return false; }
    function setAngleMode(v){ angleMode=v; } function setEraseMode(v){ eraseMode=v; }
    function cat(k){ return { k:k, name:"Camera" }; }
    function iconOf(){ return ""; } var PLUS_SVG="+";
    var work={ classList:{ toggle:function(){} } };
    var devMenu={ querySelectorAll:function(){ return []; }, classList:{ remove:function(){} } };
    var document={ getElementById:function(){ return null; } };
    function renderRooms(){} function renderPanel(){} function updateCount(){}
    function reportDevices(){} function renderUnplacedTray(){} function queueSave(){}
    function pHistPush(){} function updateCamBtns(){} function renderRoutes(){} function renderRouteBar(){}
    function rtDevKey(d){ return d ? (d.cid || ("id"+d.id)) : ""; }
    function stripDevs(){ return devices.map(function(d){ return { cid:d.cid, k:d.k }; }); }
    function planPctFromClient(cx,cy){ return { x:cx/10, y:cy/10 }; }
    function addDevice(k,x,y){ var d={ id:devices.length+1, k:k, x:x, y:y, cid:"c"+(devices.length+1) };
      devices.push(d); S.added.push(d); }
    ${extractFn("disarm")}
    ${extractFn("arm")}
    ${extractFn("placeAt")}
    ${extractFn("cutRunsFor")}
    ${extractFn("removeDevice")}
    return { arm:arm, tap:placeAt, remove:removeDevice,
             armed:function(){ return armedK; }, devices:function(){ return devices; } };
  `)(S);

  api.arm("cam");
  api.tap(100, 200); api.tap(200, 300);
  assert.equal(api.devices().length, 2, "two real placements");
  assert.equal(api.armed(), "cam", "still armed between taps");

  api.remove(1);                                   // a real delete through the real function
  assert.equal(api.armed(), null, "the delete disarmed the tool");

  api.tap(900, 400);                               // the stray tap that used to add IC7 / Camera 6
  assert.equal(api.devices().length, 1, "nothing was placed — only the deleted device is gone");
});

// The remaining call sites, checked on the real source. The behaviour above proves disarm works and
// that at least one real path reaches it; this proves the other four are connected too.
test("every non-placement action disarms", () => {
  for (const [name, fn] of [
    ["select", extractFn("select")],
    ["showDevCtx", extractFn("showDevCtx")],
    ["undoAction", extractFn("undoAction")],
    ["redoAction", extractFn("redoAction")],
    ["removeDevice", extractFn("removeDevice")],
  ]) {
    assert.ok(/\bdisarm\(\)/.test(fn), name + " disarms");
  }
  // Route already disarmed on entry for the same reason — that must not regress.
  assert.ok(/function enterRoute\(\)[\s\S]{0,420}?if\(armedK\) arm\(null\);/.test(survey),
    "enterRoute still disarms");
});

test("placing is still refused on Route, where a tap is a route point", () => {
  // placeAt's own guard — the Route half of the same concern, kept covered here too.
  const fn = extractFn("placeAt");
  assert.ok(/\|\|routing\) return;/.test(fn), "routing is in the guard");
  assert.ok(/var p=planPctFromClient\(cx,cy\);/.test(fn), "and the projection below it is live code");
});
