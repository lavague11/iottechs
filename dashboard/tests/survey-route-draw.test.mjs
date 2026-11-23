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
    var rtHist=[], rtHi=-1, rtHistFloor=-1, RT_HIST_MAX=60;
    var devices=S.devices, floors=[S.floor], curFloor=0, redoStk=[];
    function frozen(){ return S.frozen; } var RO=S.RO;
    function queueSave(){ S.saves++; }
    function renderRoutes(){} function renderRouteBar(){} function updateRedoBtn(){}
    function renderPanel(){} function updateCount(){} function reconcileLocations(){}
    function removeDevice(id){ for(var i=0;i<devices.length;i++) if(devices[i].id===id){ devices.splice(i,1); return; } }
    function reAdd(sd){ devices.push(sd); }
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
    ${extractFn("rtReanchorHomeRuns")}
    ${extractFn("rtHeadMoveTo")}
    ${extractFn("rtSyncHeadAdd")}
    ${extractFn("rtAddHead")}
    ${extractFn("rtUndoPoint")}
    ${extractFn("rtCancel")}
    ${extractFn("rtSnap")}
    ${extractFn("rtHistReset")}
    ${extractFn("rtHistPush")}
    ${extractFn("rtCanUndo")}
    ${extractFn("rtCanRedo")}
    ${extractFn("rtApply")}
    ${extractFn("rtHistUndo")}
    ${extractFn("rtHistRedo")}
    ${extractFn("undoAction")}
    ${extractFn("redoAction")}
    rtHistReset();
    return { tap:rtTap, undo:rtUndoPoint, cancel:rtCancel,
      draft:function(){ return rtDraft; }, head:function(){ return rtHeadMode; },
      setHeadMode:function(v){ rtHeadMode=v; }, setCable:function(v){ rtCable=v; },
      floor:function(){ return floors[0]; }, defCable:rtDefaultCable,
      undoAction:undoAction, redoAction:redoAction,
      moveHead:rtHeadMoveTo, addHead:rtAddHead,
      devices:function(){ return devices; },
      setRouting:function(v){ routing=v; }, routing:function(){ return routing; },
      canUndo:rtCanUndo, canRedo:rtCanRedo, histLen:function(){ return rtHist.length; } };
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
  // Every icon-only control still carries a name for a screen reader. The head control is "Move
  // head-end" now: placing one is the on-map +, and this appears only once there is one to move.
  ["Undo point", "Cancel run", "Move head-end"].forEach((l) => assert.ok(bar.includes(`aria-label="${l}"`), `aria-label ${l}`));
  assert.ok(/aria-pressed="/.test(bar), "toggles report their state");
});

// ---- The head-end has to CONNECT. A home run terminates at the head-end, so moving the head-end has
// to take every connected endpoint with it. Before the fix the head's coordinates were copied into the
// run at commit time, so a later move left the endpoint behind — 51 percent-units of gap, measured.
test("moving the head-end drags every HOME-RUN endpoint with it — no floating endpoints", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20), dev("c2", "cam", 40, 20)], floor: { head: { x: 80, y: 80 } } });
  api.tap(px(20), px(20)); api.tap(px(50), px(50)); api.tap(px(80), px(80));   // home run
  api.tap(px(40), px(20)); api.tap(px(60), px(30)); api.tap(px(20), px(20));   // daisy chain c2 -> c1
  const [home, daisy] = api.floor().routes;
  assert.equal(home.run, "home");
  assert.equal(daisy.run, "daisy");
  const daisyEndBefore = daisy.pts[daisy.pts.length - 1].slice();

  api.moveHead(30, 70);
  const h = api.floor().head;
  assert.deepEqual(h, { x: 30, y: 70 });
  assert.deepEqual(home.pts[home.pts.length - 1], [30, 70], "the home run followed the head-end exactly");
  assert.deepEqual(daisy.pts[daisy.pts.length - 1], daisyEndBefore, "a daisy chain ends on a DEVICE and must not move");
  // the path up to the endpoint is untouched — only the terminus is re-anchored
  assert.deepEqual(home.pts[0], [20, 20]);
  assert.deepEqual(home.pts[1], [50, 50]);
});

test("re-anchoring is exact — zero gap, not merely close", () => {
  const { api } = build({ devices: [dev("c1", "cam", 10, 10)], floor: { head: { x: 90, y: 90 } } });
  api.tap(px(10), px(10)); api.tap(px(90), px(90));
  for (const [x, y] of [[33.33, 66.67], [0, 0], [100, 100], [12.5, 87.5]]) {
    api.moveHead(x, y);
    const r = api.floor().routes[0], end = r.pts[r.pts.length - 1];
    assert.equal(end[0], api.floor().head.x, `x lands exactly on the head at ${x},${y}`);
    assert.equal(end[1], api.floor().head.y, `y lands exactly on the head at ${x},${y}`);
  }
});

test("re-anchoring skips junk rows instead of throwing on them", () => {
  const { api } = build({ devices: [], floor: { head: { x: 5, y: 5 }, routes: [null, { run: "home" }, { run: "home", pts: [[1, 1]] }, { run: "home", pts: [[1, 1], [2, 2]] }] } });
  api.moveHead(40, 40);
  assert.deepEqual(api.floor().routes[3].pts[1], [40, 40], "the one valid home run moved");
  assert.equal(api.floor().routes[0], null, "and the junk rows were left alone");
});

test("the on-map + ARMS placement; the next map tap puts the head-end where the rack actually is", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {} });
  assert.equal(api.floor().head, undefined, "none to start with");
  api.addHead();
  assert.equal(api.head(), true, "armed, not placed — the position is the whole point");
  assert.equal(api.floor().head, undefined, "nothing dropped at a default");
  api.tap(px(72), px(38));
  assert.deepEqual(api.floor().head, { x: 72, y: 38 }, "placed exactly where the map was tapped");
  assert.equal(api.head(), false, "and disarmed afterwards");
});

test("+ tapped and then thought better of: tapping it again cancels cleanly", () => {
  const { api, S } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {} });
  api.addHead();
  assert.equal(api.head(), true);
  api.addHead();
  assert.equal(api.head(), false, "disarmed");
  assert.equal(api.floor().head, undefined, "and nothing was placed");
  assert.equal(S.saves, 0, "nothing written either");
  // the map is live again straight away — a tap on a device starts a run, it is not swallowed
  api.tap(px(20), px(20));
  assert.ok(api.draft(), "back to normal drawing with no half-armed state left behind");
});

test("arming the + abandons a half-drawn run rather than mixing the two modes", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {} });
  api.tap(px(20), px(20)); api.tap(px(40), px(40));
  assert.equal(api.draft().pts.length, 2, "a run is in progress");
  api.addHead();
  assert.equal(api.draft(), null, "the draft is dropped");
  assert.equal(api.head(), true, "and we are armed for the head-end");
});

test("the + refuses on a locked survey, and is gone once a head-end exists", () => {
  const locked = build({ devices: [], floor: {}, frozen: true });
  locked.api.addHead();
  assert.equal(locked.api.head(), false, "a submitted survey cannot arm it");
  assert.equal(locked.api.floor().head, undefined, "and gets no head-end");
  const placed = build({ devices: [], floor: { head: { x: 10, y: 10 } } });
  placed.api.addHead();
  assert.equal(placed.api.head(), false, "with one placed the + does nothing — it is not even rendered");
});

test("the + is shown only while routing with no head-end, and the marker is not a blank box", () => {
  const sync = extractFn("rtSyncHeadAdd");
  assert.ok(/show && routing && !frozen\(\) && !RO/.test(sync), "shown only while routing, unlocked, and with none placed");
  assert.ok(/classList\.toggle\("on", !!rtHeadMode\)/.test(sync), "armed state is visible on the button");
  assert.ok(/aria-pressed/.test(sync), "and reported to a screen reader");
  // The toolbar's head-end control only exists once there IS one to move — never two ways to do the same thing.
  const bar = extractFn("renderRouteBar");
  assert.ok(/else if\(\(floors\[curFloor\]\|\|\{\}\)\.head\)\{/.test(bar), "the bar's head control is gated on a head-end existing");
  assert.ok(bar.includes('aria-label="Move head-end"'), "…and it is the MOVE control");
  assert.ok(survey.includes('rtSyncHeadAdd(!(h && isFinite(h.x) && isFinite(h.y)))'),
    "renderRoutes drives it from whether a head-end exists");
  assert.ok(survey.includes('id="rtHeadAdd" aria-label="Add head-end"'), "the button has an accessible name");
  assert.match(survey, /#rtHeadAdd\{position:absolute;right:14px;bottom:62px/, "bottom-right, clear of the bottom-centre bar");
  // the marker carries a rack glyph rather than being an empty square
  const rr = extractFn("renderRoutes");
  assert.equal((rr.match(/h\.x-1\.25/g) || []).length, 2, "two rack bars are drawn inside the marker");
});

test("a home run RENDERS onto the live head-end even for a row saved before re-anchoring existed", () => {
  // Belt and braces: the saved path is corrected on move, and the drawing is corrected at paint time,
  // so no version of the data can show a run floating beside the thing it terminates at.
  const rr = extractFn("renderRoutes");
  assert.ok(/var isEnd = \(j===last && r\.run==="home" && hd && isFinite\(hd\.x\) && isFinite\(hd\.y\)\);/.test(rr),
    "the last point of a home run is drawn at the head-end");
  assert.ok(/\(isEnd\?hd\.x:p\[0\]\)\+","\+\(isEnd\?hd\.y:p\[1\]\)/.test(rr), "…by substituting the head's coordinates");
});

// ---- Step-scoped undo/redo. The bug: Route draws over the SAME Setup canvas as Placement, and the
// floating undo button was hardcoded to "pop the last placed device" with no step check — so on Route
// it deleted a CAMERA and left every cable run in place. Reproduced live before the fix.
test("ROUTE: draw a run, undo removes the RUN and leaves every camera alone; redo brings it back", () => {
  const cams = [dev("c1", "cam", 20, 20), dev("c2", "cam", 60, 60)];
  const { api } = build({ devices: cams, floor: { head: { x: 90, y: 90 } } });
  api.tap(px(20), px(20)); api.tap(px(50), px(50)); api.tap(px(90), px(90));
  assert.equal(api.floor().routes.length, 1, "a run was committed");
  assert.equal(api.devices().length, 2);

  api.undoAction();
  assert.equal(api.floor().routes.length, 0, "the RUN is what undo removed");
  assert.equal(api.devices().length, 2, "both cameras are still here — this is the bug, pinned");
  assert.deepEqual(api.devices().map((d) => d.cid), ["c1", "c2"]);

  api.redoAction();
  assert.equal(api.floor().routes.length, 1, "redo brings the run back");
  assert.equal(api.devices().length, 2, "and still does not touch a camera");
});

test("ROUTE: head-end placement is undoable too, and is a route operation not a device one", () => {
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)], floor: {} });
  api.setHeadMode(true); api.tap(px(70), px(30));
  assert.deepEqual(api.floor().head, { x: 70, y: 30 });
  api.undoAction();
  assert.equal(api.floor().head, null, "the head-end came back off");
  assert.equal(api.devices().length, 1, "the camera is untouched");
  api.redoAction();
  assert.deepEqual(api.floor().head, { x: 70, y: 30 });
});

test("ROUTE with no route history: undo is a no-op and CANNOT fall through to a camera", () => {
  const cams = [dev("c1", "cam", 20, 20), dev("c2", "cam", 60, 60), dev("c3", "cam", 80, 20)];
  const { api, S } = build({ devices: cams, floor: {} });
  assert.equal(api.canUndo(), false, "nothing to undo");
  api.undoAction(); api.undoAction(); api.undoAction();
  assert.equal(api.devices().length, 3, "all three cameras still present");
  assert.deepEqual(api.devices().map((d) => d.cid), ["c1", "c2", "c3"]);
  assert.equal(S.saves, 0, "and nothing was written");
  api.redoAction();
  assert.equal(api.devices().length, 3, "redo with nothing to redo is also inert");
});

test("ROUTE: undo does not reach PAST the point the step was entered at", () => {
  // The baseline snapshot is taken on entry, so repeated undo stops at "the routes as they were when
  // I opened Route" rather than unwinding into whatever came before.
  const { api } = build({ devices: [dev("c1", "cam", 20, 20)], floor: { head: { x: 90, y: 90 }, routes: [{ id: "r0", dev: "c0", cable: "cat6", run: "home", pts: [[1, 1], [2, 2]] }] } });
  api.tap(px(20), px(20)); api.tap(px(90), px(90));
  assert.equal(api.floor().routes.length, 2);
  api.undoAction(); api.undoAction(); api.undoAction();
  assert.equal(api.floor().routes.length, 1, "stops at the run that was already there on entry");
  assert.equal(api.floor().routes[0].id, "r0");
});

test("PLACEMENT: undo/redo still pops and restores the last placed device, exactly as before", () => {
  const cams = [dev("c1", "cam", 20, 20), dev("c2", "cam", 60, 60)];
  const { api } = build({ devices: cams, floor: {} });
  api.setRouting(false);                               // the Placement step
  api.undoAction();
  assert.deepEqual(api.devices().map((d) => d.cid), ["c1"], "the last placed camera is popped");
  api.redoAction();
  assert.deepEqual(api.devices().map((d) => d.cid), ["c1", "c2"], "and redo puts it back");
});

test("the step guard goes first and RETURNS — the source shape that makes the fall-through impossible", () => {
  // The device-touching symbol differs per function: undo reads `devices`, redo restores from `redoStk`.
  for (const [name, fn, deviceToken] of [
    ["undoAction", extractFn("undoAction"), "devices"],
    ["redoAction", extractFn("redoAction"), "redoStk"],
  ]) {
    const guard = fn.indexOf("if(routing)");
    const touch = fn.indexOf(deviceToken);
    assert.ok(guard >= 0, `${name} checks the step`);
    assert.ok(/if\(routing\)\{[^}]*return; \}/.test(fn), `${name}'s routing branch returns`);
    assert.ok(touch > 0, `${name} does reach device state via ${deviceToken}`);
    assert.ok(guard < touch, `${name} checks the step BEFORE it can reach ${deviceToken}`);
  }
  // …and the buttons themselves are hidden on Route unless the route history has something in it.
  assert.ok(/ub\.style\.display = routing \? \(\(!rtDraft && !frozen\(\) && !RO && rtCanUndo\(\)\)/.test(survey),
    "the floating undo follows the route history while routing");
  assert.ok(/b\.style\.display = routing \? \(\(!rtDraft && !frozen\(\) && rtCanRedo\(\)\)/.test(survey),
    "…and so does redo");
});

test("BUG #103 — Route shows only Route's tools; Placement's + is not one of them", () => {
  // On Route the top-left + was still there, and it opened Placement's device-category picker
  // (Camera / Angle / NVR / ISP / PoE Switch / Display) on a step that places no devices.
  assert.match(survey, /body\.routing #addDeviceBtn,\s*body\.routing #buildPlanFab\{display:none!important\}/,
    "the device + and the Floor Plan action are hidden while routing");
  // The precedent this follows: the region editor already hides the tool that is not its own.
  assert.match(survey, /body\.regions #undoBtn\{display:none!important\}/, "same shape as the regions rule");
  // Route's OWN tools stay: the cable bar, and the head-end + only while there is no head-end.
  assert.match(survey, /body\.routing #rtBar\{display:flex\}/, "the cable bar is Route's own");
  assert.ok(survey.includes('id="rtHeadAdd"'), "…as is the head-end +");
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
  assert.ok(src.includes('closest("#rtBar,#rtHeadAdd")'),
    "taps on the toolbar and on the head-end + are not canvas taps — both own their own");
});
