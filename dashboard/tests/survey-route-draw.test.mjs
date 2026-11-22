// Stage 1 — the ROUTE DRAWING interaction, extracted from the widget and EXECUTED (not source-matched):
// tap a device, tap the path, tap the head-end. Plus the derived run type, the smart cable default,
// the undo/cancel rules and the submitted-survey lock.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validRoutes, CABLES } from "../lib/survey-routes.js";

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
const CABLE_SRC = survey.slice(survey.indexOf("var ROUTE_CABLES="), survey.indexOf("var ROUTE_OUTLINE="));

// A 400×400 plan world, so a percent point is 4px and the 26px tap slop is 6.5%.
function build({ devices = [], floor = {}, frozen = false, RO = false } = {}) {
  const api = new Function("S", `
    ${CABLE_SRC}
    var routing=true, rtDraft=null, rtCable=null, rtHeadMode=false, RT_TOUCH=26;
    var devices=S.devices, floors=[S.floor], curFloor=0;
    function frozen(){ return S.frozen; } var RO=S.RO;
    function queueSave(){ S.saves++; }
    function renderRoutes(){} function renderRouteBar(){}
    function rCable(k){ for(var i=0;i<ROUTE_CABLES.length;i++) if(ROUTE_CABLES[i][0]===k) return ROUTE_CABLES[i]; return ROUTE_CABLES[0]; }
    function rRoutes(create){ var f=floors[curFloor]; if(!f) return []; if(!Array.isArray(f.routes)){ if(!create) return []; f.routes=[]; } return f.routes; }
    var document={ getElementById:function(){ return { getBoundingClientRect:function(){ return {left:0,top:0,width:400,height:400}; } }; } };
    ${extractFn("rtDefaultCable")}
    ${extractFn("rtDevKey")}
    ${extractFn("rtPct")}
    ${extractFn("rtNear")}
    ${extractFn("rtDeviceAt")}
    ${extractFn("rtHeadAt")}
    ${extractFn("rtNewId")}
    ${extractFn("rt2")}
    ${extractFn("rtCommit")}
    ${extractFn("rtTap")}
    ${extractFn("rtUndoPoint")}
    ${extractFn("rtCancel")}
    return { tap:rtTap, undo:rtUndoPoint, cancel:rtCancel,
      draft:function(){ return rtDraft; }, head:function(){ return rtHeadMode; },
      setHeadMode:function(v){ rtHeadMode=v; }, setCable:function(v){ rtCable=v; },
      floor:function(){ return floors[0]; }, defCable:rtDefaultCable };
  `);
  const S = { devices, floor, frozen, RO, saves: 0 };
  return { api: api(S), S };
}
// percent → client px on the 400×400 world
const px = (p) => p * 4;
const dev = (cid, k, x, y) => ({ id: cid, cid, k, x, y, placed: true });

test("a run starts on a device and nowhere else", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)] });
  api.tap(px(70), px(70));                       // empty space
  assert.equal(api.draft(), null, "tapping the plan with no run in progress does nothing");
  api.tap(px(20), px(20));                       // the camera
  assert.deepEqual(api.draft().pts, [[20, 20]], "the run is anchored on the device, not the tap point");
  assert.equal(api.draft().dev, "c1");
});

test("the cable prefills from the device kind, and the chips override it", () => {
  const { api } = build({ devices: [dev("s1", "spk", 10, 10), dev("d1", "disp", 50, 10), dev("o1", "outlet", 90, 10), dev("c1", "cam", 10, 50)] });
  assert.equal(api.defCable("spk"), "speaker");
  assert.equal(api.defCable("disp"), "hdmi");
  assert.equal(api.defCable("outlet"), "power");
  assert.equal(api.defCable("cam"), "cat6");
  assert.equal(api.defCable("nvr"), "cat6", "anything unlisted is Cat6, never undefined");
  api.tap(px(10), px(10));
  assert.equal(api.draft().cable, "speaker", "a speaker prefills speaker wire — no decision needed");
  api.cancel();
  api.setCable("hdmi");
  api.tap(px(10), px(10));
  assert.equal(api.draft().cable, "hdmi", "an explicit chip beats the kind default");
  // every default is a real cable key
  CABLES.forEach((c) => assert.ok(typeof c.key === "string"));
  ["spk", "disp", "outlet", "cam", "nvr"].forEach((k) => assert.ok(CABLES.some((c) => c.key === api.defCable(k))));
});

test("tapping the path adds points; finishing ON THE HEAD-END is a home run", () => {
  const floor = { head: { x: 80, y: 80 }, devices: [] };
  const { api, S } = build({ devices: [dev("c1", "cam", 20, 20)], floor });
  api.tap(px(20), px(20));
  api.tap(px(20), px(50));
  api.tap(px(50), px(50));
  assert.equal(api.draft().pts.length, 3);
  api.tap(px(80), px(80));                        // the head-end
  assert.equal(api.draft(), null, "the run committed");
  const [r] = api.floor().routes;
  assert.equal(r.run, "home", "ending at the head-end IS a home run — never a separate toggle");
  assert.deepEqual(r.pts, [[20, 20], [20, 50], [50, 50], [80, 80]]);
  assert.equal(r.dev, "c1");
  assert.ok(S.saves > 0, "a committed run is saved");
  assert.equal(validRoutes(api.floor().routes).length, 1, "and it survives the shared validator");
});

test("finishing ON ANOTHER DEVICE is a daisy chain", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20), dev("c2", "cam", 60, 20)], floor: { head: { x: 90, y: 90 } } });
  api.tap(px(20), px(20));
  api.tap(px(40), px(30));
  api.tap(px(60), px(20));                        // the second camera
  const [r] = api.floor().routes;
  assert.equal(r.run, "daisy");
  assert.equal(r.dev, "c1", "the run belongs to the device it STARTED at");
  assert.deepEqual(r.pts[r.pts.length - 1], [60, 20], "it snaps to the device, not the finger");
});

test("tapping the SAME device again is a path point, not an instant zero-length daisy chain", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {} });
  api.tap(px(20), px(20));
  api.tap(px(20), px(20));
  assert.equal(api.draft().pts.length, 2, "still drawing");
  assert.equal((api.floor().routes || []).length, 0, "nothing committed");
});

test("a tap within the touch slop counts as hitting the marker", () => {
  const { api } = build({ devices: [dev("c1", "cam", 50, 50)] });
  api.tap(px(50) + 20, px(50) + 10);              // 22px away — inside the 26px slop
  assert.ok(api.draft(), "a fingertip near the marker still starts the run");
  assert.deepEqual(api.draft().pts, [[50, 50]], "and anchors on the marker, not the finger");
  api.cancel();
  api.tap(px(50) + 60, px(50));                   // well outside
  assert.equal(api.draft(), null);
});

test("head-end mode places it on the next tap, then turns itself off", () => {
  const { api, S } = build({ devices: [], floor: {} });
  api.setHeadMode(true);
  api.tap(px(70), px(30));
  assert.deepEqual(api.floor().head, { x: 70, y: 30 });
  assert.equal(api.head(), false, "one tap, one placement — it does not stay armed");
  assert.ok(S.saves > 0);
  // placing it again moves it rather than adding a second
  api.setHeadMode(true);
  api.tap(px(10), px(10));
  assert.deepEqual(api.floor().head, { x: 10, y: 10 });
});

test("undo takes back one point; undoing the anchor cancels the run", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {} });
  api.tap(px(20), px(20));
  api.tap(px(30), px(40));
  api.tap(px(40), px(60));
  assert.equal(api.draft().pts.length, 3);
  api.undo();
  assert.equal(api.draft().pts.length, 2);
  api.undo();
  assert.equal(api.draft().pts.length, 1);
  api.undo();
  assert.equal(api.draft(), null, "undoing the device anchor ends the run rather than leaving an empty one");
  api.undo();                                      // and undo on nothing is a no-op, not a throw
  assert.equal(api.draft(), null);
});

test("a submitted or read-only survey cannot be drawn on (§Editing rules 8)", () => {
  for (const lock of [{ frozen: true }, { RO: true }]) {
    const { api, S } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {}, ...lock });
    api.tap(px(20), px(20));
    assert.equal(api.draft(), null, `locked (${JSON.stringify(lock)}): no run starts`);
    api.setHeadMode(true);
    api.tap(px(70), px(70));
    assert.equal(api.floor().head, undefined, "and no head-end is placed");
    assert.equal(S.saves, 0, "a locked survey is never written to");
  }
});

test("route ids are unique within the floor, including after a delete leaves a gap", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20), dev("c2", "cam", 60, 60)], floor: { head: { x: 90, y: 90 }, routes: [{ id: "r1" }, { id: "r3" }] } });
  api.tap(px(20), px(20));
  api.tap(px(90), px(90));
  const ids = api.floor().routes.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "no id collision");
  assert.ok(ids.includes("r2"), "the gap left by a deleted run is reused rather than growing forever");
});

test("the bar is contextual: head-end at rest, undo + cancel while drawing", () => {
  const bar = extractFn("renderRouteBar");
  assert.ok(bar.includes('if(rtDraft){') && bar.indexOf('data-rt="undo"') > bar.indexOf('if(rtDraft){'),
    "undo/cancel only exist while a run is in progress");
  assert.ok(bar.includes('data-rt="head"'), "the head-end control exists at rest");
  assert.ok(bar.indexOf('data-rt="head"') > bar.indexOf('data-rt="cancel"'),
    "…in the else branch, so the bar never shows a control that would do nothing");
  // Every icon-only control still carries a name for a screen reader.
  ["Undo point", "Cancel run", "Head-end"].forEach((l) => assert.ok(bar.includes(`aria-label="${l}"`), `aria-label ${l}`));
  assert.ok(/aria-pressed="/.test(bar), "toggles report their state");
});

test("phone width: the route bar fits, and the overlay header's centre track is capped", () => {
  // Measured at 375px: four chips plus the head-end control were 378px of content in a 353px bar, so
  // "Power" was clipped off the end. One-word chip labels plus tighter metrics bring it to 348.
  assert.ok(/\.rtChip\{[^}]*padding:0 9px/.test(survey), "chip padding is the tightened value");
  assert.ok(/#rtBar\{[^}]*gap:4px/.test(survey), "bar gap is the tightened value");
  assert.ok(/\.rtSep\{(?:(?!margin)[^}])*\}/.test(survey), "the separator carries no margin");
  const bar = extractFn("renderRouteBar");
  assert.ok(bar.includes('c[1].split(" ")[0]'), "the chip shows one word");
  assert.ok(bar.includes('aria-label="\'+c[1]+\'"') || bar.includes("aria-label=\"'+c[1]+'\""),
    "…while the full cable name stays the accessible name");

  // The overlay title bar: a bare `auto` centre track takes MAX-content, so a long project name
  // overflowed the grid and painted over the tool name on the left (72px of overlap, measured) while
  // its own ellipsis never engaged. fit-content() caps the track so the ellipsis works.
  const hub = readFileSync(new URL("../app/project/[accessId]/staff-hub.jsx", import.meta.url), "utf8");
  assert.match(hub, /\.cpv-ovl-bar\{display:grid;grid-template-columns:minmax\(0,1fr\) fit-content\(\d+%\) minmax\(0,1fr\)/,
    "the centre track is capped, not auto");
  assert.match(hub, /\.cpv-ovl-proj\{[^}]*min-width:0[^}]*overflow:hidden/, "and the centre item can actually shrink");
});

test("a drag pans the canvas and must never drop a route point", () => {
  const src = survey.slice(survey.indexOf('var dx0=0, dy0=0, moved=false'), survey.indexOf("})();", survey.indexOf("var dx0=0, dy0=0, moved=false")));
  assert.ok(/moved=true/.test(src) && />8/.test(src), "movement past a few px disqualifies the tap");
  assert.ok(/if\(!routing \|\| moved \|\| Date\.now\(\)-downT>700\) return;/.test(src),
    "pointerup only taps when it did not move and was not a long press");
  assert.ok(src.includes('closest("#rtBar")'), "taps on the toolbar are not canvas taps");
});
