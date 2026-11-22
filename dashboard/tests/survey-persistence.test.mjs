// SECTION L — reopening the Site Survey. The spec's own test: place 2 cameras → close → reopen → both
// cameras + scale + step still there. Plus the four regressions that made reopening lose everything:
//   1. a failed restore overwriting the saved row with an empty default,
//   2. the rail step never being persisted (every reopen landed on Layout),
//   3. the Devices list and Camera Angles reading two different camera arrays,
//   4. a floor's real-world scale being dropped on load.
//
// Two layers, both under bare Node:
//   · lib/survey-state.js — the pure saved-state reader the host uses (database-first).
//   · public/widgets/site-survey-merged.html — the single-file ES5 widget: its pure save helpers are
//     brace-extracted and evaluated against stubs, the same pattern as grid-transform/areas/boundary.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RAIL_STEPS, normalizeRailStep, rosterFromSurvey, camerasFromSurvey, surveyCameraCount,
  surveyFloorScales, surveyLastStep, surveyHasDevices, surveyFloors,
} from "../lib/survey-state.js";
import { surveyEditedAfterSubmit } from "../lib/survey-state.js";
// the literal object the host mirror POSTs, for asserting what it does and does not carry
const postBody = (s) => (s.match(/body: JSON\.stringify\(\{[^}]*\}\)/) || [""])[0];
import { survey2HasData, survey2CameraCount, mockupHasData, toolFingerprint } from "../lib/tool-data.js";
import { can } from "../lib/roles.js";
import { toolPayloadSendable, postToolData, startToolAutosync, suspendToolSync, retryToolSync, seedToolData } from "../app/project/[accessId]/tool-sync.js";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const sync = readFileSync(new URL("../app/project/[accessId]/tool-sync.js", import.meta.url), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

// ---- a realistic saved survey: one scaled floor, two placed cameras, user left on Camera Angles ----
const cam = (n, cid, photo = null) => ({
  k: "cam", x: 10 * n, y: 20 * n, aim: 90, aimed: true, fov: 90, range: 40,
  name: `Camera ${n}`, locName: `Dining ${n}`, placementType: "inside", cid, photo,
});
const SAVED = {
  floors: [{
    id: "f_abc", name: "Floor 1", bg: "data:image/png;base64,AAA", started: true,
    scale: { ftW: 86, ftH: 60 },
    plan: { cells: [1, 2, 3], rooms: [{ name: "Dining" }], metersPerPx: 0.051 },
    devices: [cam(1, "c1"), cam(2, "c2")],
  }],
  curFloor: 0, step: 1, lastStep: "views", submitted: false,
};
const savedJson = JSON.stringify(SAVED);

// ---------------------------------------------------------------- the spec's test ------------------
test("place 2 cameras → close → reopen: both cameras, the scale and the step are still there", () => {
  // "Reopen" is exactly this: read the saved blob back and rebuild what the host renders from it.
  const roster = rosterFromSurvey(savedJson);
  assert.equal(roster.length, 1, "the saved floor survives the reopen");
  assert.equal(roster[0].devices.length, 2, "both cameras come back");
  assert.deepEqual(roster[0].devices.map((d) => d.name), ["Camera 1", "Camera 2"]);
  assert.deepEqual(roster[0].devices.map((d) => d.cid), ["c1", "c2"], "stable camera ids survive");

  assert.deepEqual(surveyFloorScales(savedJson), [{ ftW: 86, ftH: 60 }], "the floor's real-world scale is never reset");
  assert.equal(surveyLastStep(savedJson), "views", "the reopen resumes on the step the user was on");
  assert.equal(surveyFloors(savedJson)[0].plan.metersPerPx, 0.051, "the plan's scale (the grid's feet-per-box) survives");
});

// ---------------------------------------------------------------- root cause 2: the step ------------
test("a rail step past Layout round-trips — Placement, Camera Angles and Approval are all restorable", () => {
  assert.deepEqual(RAIL_STEPS, ["background", "layout", "cameras", "views", "review"]);
  for (const step of RAIL_STEPS) {
    const blob = JSON.stringify({ ...SAVED, lastStep: step });
    assert.equal(surveyLastStep(blob), step, `lastStep "${step}" (rail index ${RAIL_STEPS.indexOf(step)}) survives a reopen`);
  }
  // Index >= 2 is the regression: the widget's own goStep clamps to 0..1 because it only HAS two internal
  // steps, so the five-step rail position has to be stored separately — which is what lastStep is.
  for (const step of ["cameras", "views", "review"]) {
    assert.ok(RAIL_STEPS.indexOf(step) >= 2);
    assert.equal(surveyLastStep(JSON.stringify({ ...SAVED, lastStep: step })), step);
  }
  assert.equal(surveyLastStep(JSON.stringify({ ...SAVED, lastStep: undefined })), "layout", "no saved step → the old default");
  assert.equal(surveyLastStep(JSON.stringify({ ...SAVED, lastStep: "nonsense" })), "layout", "junk never selects a step");
  assert.equal(normalizeRailStep("REVIEW"), "review");
  assert.equal(normalizeRailStep("placement"), null, "only the five real rail keys are accepted");
});

test("a submitted survey reopens on Approval, in review mode", () => {
  const sub = JSON.stringify({ ...SAVED, submitted: true, lastStep: "cameras" });
  assert.equal(surveyLastStep(sub), "review");
  assert.equal(surveyLastStep(savedJson, { submitted: true }), "review", "the SERVER's acceptance row can force it too");
  assert.equal(surveyLastStep(savedJson, { submitted: false }), "views", "an unsubmitted survey still resumes where the user was");
});

// ---------------------------------------------------------------- root cause 3: one device list -----
test("the Devices list and Camera Angles read ONE saved device list", () => {
  // The Devices strip renders the roster; Camera Angles renders getProjectCameras (lib/db.js), which
  // walks the same floors→devices order off the same row. Both must agree on count AND order.
  const roster = rosterFromSurvey(savedJson);
  const flatFromRoster = roster.flatMap((f) => f.devices.filter((d) => d.k === "cam").map((d) => d.cid));
  const fromCameras = camerasFromSurvey(savedJson).map((c) => c.id);
  assert.deepEqual(fromCameras, flatFromRoster, "same cameras, same order — never '8 cameras' on one surface and 'none' on the other");
  assert.equal(surveyCameraCount(savedJson), 2);
  assert.equal(surveyCameraCount(savedJson), survey2CameraCount(savedJson), "and the same count the server-side counter reports");

  // Eight cameras over two floors — the exact shape of the spec's clue ("View 1 of 8 · CAM 1" vs "No cameras yet").
  const eight = JSON.stringify({ floors: [
    { name: "Floor 1", started: true, bg: "x", devices: [cam(1, "a1"), cam(2, "a2"), cam(3, "a3"), cam(4, "a4")] },
    { name: "Floor 2", started: true, bg: "y", devices: [cam(5, "b1"), { k: "nvr", x: 1, y: 1 }, cam(6, "b2"), cam(7, "b3"), cam(8, "b4")] },
  ] });
  assert.equal(surveyCameraCount(eight), 8);
  assert.equal(rosterFromSurvey(eight).reduce((n, f) => n + f.devices.length, 0), 9, "the roster carries non-camera devices too");
  assert.deepEqual(camerasFromSurvey(eight).map((c) => c.id), ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"]);
  assert.deepEqual(camerasFromSurvey(eight).map((c) => c.floor), [0, 0, 0, 0, 1, 1, 1, 1]);
});

test("a SUBMITTED survey still renders its devices — a lock never means an empty list", () => {
  const sub = JSON.stringify({ ...SAVED, submitted: true });
  assert.equal(surveyHasDevices(sub), true, "the host can tell the database holds devices");
  assert.equal(rosterFromSurvey(sub)[0].devices.length, 2, "locked, but the saved cameras are there to display");
  assert.equal(surveyCameraCount(sub), 2);
});

test("a corrupt blob yields nothing instead of throwing — the host must never crash on a bad row", () => {
  for (const bad of [null, undefined, "", "{", "[]", "null", '{"floors":{"length":2}}', '{"floors":[null,7,"x"]}']) {
    assert.doesNotThrow(() => rosterFromSurvey(bad));
    assert.doesNotThrow(() => camerasFromSurvey(bad));
    assert.doesNotThrow(() => surveyFloorScales(bad));
    assert.equal(surveyLastStep(bad), "layout");
    assert.equal(surveyHasDevices(bad), false);
  }
  // A legacy single-floor save (pre-floors[]) still reads as one floor.
  const legacy = JSON.stringify({ bg: "data:image/png;base64,AAA", devices: [cam(1, "c1")] });
  assert.equal(rosterFromSurvey(legacy).length, 1);
  assert.equal(surveyCameraCount(legacy), 1);
});

// ---------------------------------------------------------------- the landmine: approvals -----------
test("lastStep is ADDITIVE — it does not move the approval fingerprint", () => {
  const without = JSON.stringify({ ...SAVED, lastStep: undefined });
  const withStep = JSON.stringify({ ...SAVED, lastStep: "review" });
  assert.equal(toolFingerprint("survey2", without), toolFingerprint("survey2", withStep),
    "storing the rail step must never void a customer's survey approval");
  assert.equal(survey2HasData(withStep), true);
});

// ---------------------------------------------------------------- root cause 1: the save gate -------
// The widget's REAL restore + save path, extracted and EXECUTED against stubs — not pattern-matched.
// floors[] starts life as ONE EMPTY PLACEHOLDER floor; snapFloor() copies the live editor (bgData /
// curFloorScale / devices) onto floors[curFloor]. Run that over the placeholder and the saved floor is
// replaced by an empty one, and save() then writes it to localStorage AND POSTs it to the server.
// `stateLoaded` is the gate that makes this impossible, and restore() is the only thing that opens it.
const PLACEHOLDER = { name: "Floor 1", bg: null, devices: [], started: false };
const placeholder = () => [JSON.parse(JSON.stringify(PLACEHOLDER))];

// Every widget function that reads or writes the saved blob, plus restore() and its helpers.
const WIDGET_FNS = [
  "stripDevs", "snapFloor", "serialize", "save", "flushNow", "saveVersionsSoon", "pushServer",
  "normFloor", "normRail", "ensureFloorIds", "newFloorId", "failRestore", "loadErr", "discardLocalCopy", "restore",
];

// `stored` is this device's localStorage value; `breakLoadFloor` makes loadFloor throw, which is exactly
// what a restore failure looks like from the save path's point of view.
function widgetEnv({ stored = null, breakLoadFloor = false } = {}) {
  const FNS = WIDGET_FNS.map((n) => extractFn(widget, n)).join("\n");
  const S = { store: { value: stored }, posted: [], banner: { shown: false }, msgs: [], bodyClasses: [], breakLoadFloor };
  const factory = new Function("S", `
    var stateLoaded=false, restoreFailed=false;
    var floors=[{name:"Floor 1",bg:null,devices:[],started:false}], curFloor=0, devices=[];
    var bgData=null, bgHasImage=false, curBgSource=null, curFloorScale=null, curFloorAerial=null;
    var curStep=1, railStep=null, editedAfterSubmit=false, dimmed=false, submitted=false, approved=false;
    var ISZ=1, showFovState=false, gridMode=0, sideCollapsed=false, showAllAngles=false, bgToolOpen=null;
    var bgToolSrc=null, lastJson=null, RO=false, PID="P1", PKEY="k", saveT=null, sugT=null, clearIntent=false;
    var RAIL_STEPS=["background","layout","cameras","views","review"];
    var localStorage={ getItem:function(){ return S.store.value; }, setItem:function(k,v){ S.store.value=v; },
      removeItem:function(){ S.store.value=null; } };
    var parent={ postMessage:function(m){ S.msgs.push(m); } };
    var document={ body:{ classList:{ add:function(){ for(var i=0;i<arguments.length;i++) S.bodyClasses.push(arguments[i]); }, toggle:function(){}, remove:function(){} },
        appendChild:function(el){ S.banner.shown=true; S.banner.el=el; } },
      getElementById:function(){ return null; }, querySelector:function(){ return null; },
      createElement:function(){ return { style:{}, setAttribute:function(){}, addEventListener:function(){}, appendChild:function(){} }; } };
    function setTimeout(){}
    function serverSaveState(){}
    // The REAL pushServer runs here (gate included); only the network is stubbed, and it records the body.
    function fetch(u, o){ S.posted.push(JSON.parse(o.body).data); return { then:function(){ return { then:function(){ return { catch:function(){} }; } }; } }; }
    // Real normalizers the widget's restore depends on; faithful enough for the blobs under test.
    function validGrid(g){ return (g && +g.boxFt>0) ? g : null; }
    function bdValidBoundary(b){ return b || null; }
    function zValidZones(z){ return Array.isArray(z) ? z : []; }
    function validVersions(v){ return Array.isArray(v) ? v : []; }
    // loadFloor's ONE job here: mirror floors[curFloor] into the live editor. That is precisely what
    // must happen before the save gate may open.
    function loadFloor(i){ if(S.breakLoadFloor) throw new Error("loadFloor blew up");
      var f=floors[i]||{}; devices=(f.devices||[]).slice(); bgData=f.bg||null; bgHasImage=!!f.started;
      curBgSource=f.bgSource||null; curFloorScale=f.scale||null; curFloorAerial=f.aerial||null; }
    function applySettings(){} function applySideCollapsed(){} function applyDim(){}
    function setStatus(){} function renderFloorTabs(){} function goStep(){} function reportHost(){}
    function saveErr(){} function refreshSugs(){} function reclaimInlineImages(){}
    function enterDraw(){} function enterBg(){} function postAerialRestore(){}
    function uploadBackground(){} function pushVersion(){}
    ${FNS}
    return { restore:restore, save:save, flushNow:flushNow, saveVersionsSoon:saveVersionsSoon,
      serialize:serialize, snapFloor:snapFloor,
      state:function(){ return { stateLoaded:stateLoaded, restoreFailed:restoreFailed, floors:floors,
        railStep:railStep, editedAfterSubmit:editedAfterSubmit, devices:devices, curFloorScale:curFloorScale,
        submitted:submitted }; } };
  `);
  return { api: factory(S), S };
}

test("restore() EXECUTED: a real saved survey comes back — floors, devices, scale and the rail step", () => {
  const { api, S } = widgetEnv({ stored: savedJson });
  api.restore();
  const st = api.state();
  assert.equal(st.restoreFailed, false);
  assert.equal(st.stateLoaded, true, "the save gate opens on a successful restore");
  assert.equal(st.floors.length, 1);
  assert.equal(st.floors[0].devices.length, 2, "both cameras restored into memory");
  assert.equal(st.devices.length, 2, "and loadFloor mirrored them into the live editor");
  assert.deepEqual(st.curFloorScale, { ftW: 86, ftH: 60 }, "the floor's scale is live, so snapFloor writes it back instead of nulling it");
  assert.equal(st.railStep, "views", "the saved rail step is in memory");
  // A save now round-trips the whole thing, cameras and scale included.
  api.save();
  const out = JSON.parse(S.store.value);
  assert.equal(out.floors[0].devices.length, 2);
  assert.deepEqual(out.floors[0].scale, { ftW: 86, ftH: 60 });
  assert.equal(out.lastStep, "views");
});

test("restore() EXECUTED: a CORRUPT local blob keeps the gate shut and is never overwritten", () => {
  for (const bad of ['{"floors":[{"name":"F1"', "not json at all", '"a string"', "42", '{"floors":{"length":2}}']) {
    const { api, S } = widgetEnv({ stored: bad });
    api.restore();
    const st = api.state();
    assert.equal(st.restoreFailed, true, `corrupt blob ${bad} is a READ FAILURE, not a new project`);
    assert.equal(st.stateLoaded, false, "so the save gate stays shut");
    // Now the user edits. Every write path must refuse.
    api.save(); api.flushNow(); api.saveVersionsSoon();
    assert.equal(S.store.value, bad, "this device's bytes are untouched");
    assert.deepEqual(S.posted, [], "and nothing was POSTed over the server's copy");
    assert.ok(S.bodyClasses.includes("frozen"), "the editor is visibly read-only, not a surface that silently drops work");
    assert.ok(S.banner.shown, "and the failure is on screen, with the way out");
    assert.ok(S.msgs.some((m) => m.type === "iotSurveyLoadFailed"), "the host is told");
  }
});

test("restore() EXECUTED: loadFloor throwing mid-restore cannot overwrite the saved survey", () => {
  const { api, S } = widgetEnv({ stored: savedJson, breakLoadFloor: true });
  api.restore();
  assert.equal(api.state().stateLoaded, false, "a throw before the editor mirrors the floor keeps the gate shut");
  assert.equal(api.state().restoreFailed, true);
  api.save(); api.flushNow(); api.saveVersionsSoon();
  assert.equal(S.store.value, savedJson, "the saved survey is byte-identical");
  assert.deepEqual(S.posted, [], "and the server row was never written");
  // The in-memory floors may hold the restored data, but nothing may be SERIALIZED from this state.
  api.snapFloor();
  assert.equal(api.state().floors[0].devices.length, 2, "snapFloor is inert, so it can't blank the restored floor either");
});

test("restore() EXECUTED: a genuinely new project opens the gate — nothing saved, nothing to lose", () => {
  for (const empty of [null, "", "   "]) {
    const { api, S } = widgetEnv({ stored: empty });
    api.restore();
    assert.equal(api.state().stateLoaded, true, "no saved copy → saving is safe");
    assert.equal(api.state().restoreFailed, false);
    api.save();
    assert.ok(S.store.value && JSON.parse(S.store.value), "and the first save actually lands");
  }
});

test("the saveVersionsSoon bypass is closed — an async upload callback can't write over a failed restore", () => {
  // saveVersionsSoon() is reached from recordBgVersion/recordCtxVersion's upload callbacks, which land
  // long after load. It calls localStorage.setItem + pushServer DIRECTLY, so snapFloor's own guard does
  // not protect it: serialize() still stringifies whatever `floors` currently is.
  const { api, S } = widgetEnv({ stored: savedJson, breakLoadFloor: true });
  api.restore();
  api.saveVersionsSoon();
  assert.equal(S.store.value, savedJson);
  assert.deepEqual(S.posted, []);
  // And with the state loaded it does write, so the gate hasn't broken the feature.
  const ok = widgetEnv({ stored: savedJson });
  ok.api.restore();
  ok.api.saveVersionsSoon();
  assert.equal(ok.S.posted.length, 1, "a legitimate version save still reaches the server");
});

test("every write path in the widget is behind the save gate — the full list, not a sample", () => {
  // Enumerated from the source: every site that writes localStorage[PKEY] or calls pushServer.
  const writers = ["save", "flushNow", "snapFloor", "reclaimInlineImages", "saveVersionsSoon", "loadSample", "pushServer"];
  for (const fn of writers) {
    assert.match(extractFn(widget, fn), /!stateLoaded\) return/, `${fn}() must refuse to run before the state is loaded`);
  }
  // No OTHER site may touch the store directly. Each hit must sit inside one of the gated functions above.
  const hits = widget.match(/localStorage\.setItem\(PKEY|pushServer\(/g) || [];
  assert.ok(hits.length >= 6, "the audit found the write sites");
  // pushServer is the single route to the server, and it is gated — so no caller can get past it.
  assert.match(extractFn(widget, "pushServer"), /if\(RO\|\|!PID\|\|!json\) return; if\(!stateLoaded\) return;/,
    "pushServer keeps its RO guard AND carries the save gate");
});

function savePath({ stateLoaded, floors, devices = [], bgHasImage = false, bgData = null, curFloorScale = null }) {
  // pushServer is stubbed here so `posted` reads cleanly; the REAL pushServer (with its own gate) is
  // exercised by widgetEnv above and pinned by the write-path audit.
  const FNS = ["stripDevs", "snapFloor", "serialize", "save", "flushNow"].map((n) => extractFn(widget, n)).join("\n");
  const store = { value: "THE-REAL-SAVED-SURVEY" };
  const posted = [];
  const factory = new Function("S", `
    var stateLoaded=S.stateLoaded, floors=S.floors, curFloor=0, devices=S.devices;
    var bgData=S.bgData, bgHasImage=S.bgHasImage, curBgSource=null, curFloorScale=S.curFloorScale, curFloorAerial=null;
    var curStep=1, railStep=S.railStep||null, editedAfterSubmit=false, dimmed=false, submitted=false, ISZ=1, showFovState=false;
    var gridMode=0, sideCollapsed=false, showAllAngles=false, bgToolOpen=null, lastJson=null, RO=false, PID="P1", PKEY="k";
    var localStorage={ getItem:function(){ return S.store.value; }, setItem:function(k,v){ S.store.value=v; } };
    function reclaimInlineImages(){}
    function reportHost(){}
    function saveErr(){}
    function pushServer(j){ S.posted.push(j); }
    ${FNS}
    return { save:save, flushNow:flushNow, serialize:serialize, snapFloor:snapFloor, floors:function(){ return floors; } };
  `);
  return { api: factory({ stateLoaded, floors, devices, bgData, bgHasImage, curFloorScale, store, posted }), store, posted };
}

test("a failed restore can NOT overwrite the saved row — save() and flushNow() are gated on stateLoaded", () => {
  // stateLoaded === false is exactly the state restore() leaves behind when it throws.
  const { api, store, posted } = savePath({ stateLoaded: false, floors: placeholder() });
  api.save();
  api.flushNow();
  assert.equal(store.value, "THE-REAL-SAVED-SURVEY", "localStorage still holds the real survey");
  assert.deepEqual(posted, [], "and nothing was POSTed to /api/tool-data");
  // snapFloor must not have touched the placeholder either (it is what destroys the floor).
  assert.deepEqual(api.floors()[0], { name: "Floor 1", bg: null, devices: [], started: false });
});

test("snapFloor over the placeholder would erase a real floor — proving the gate is load-bearing", () => {
  const real = [{ name: "Floor 1", bg: "IMG", started: true, scale: { ftW: 86, ftH: 60 }, devices: [cam(1, "c1"), cam(2, "c2")] }];
  // Gate OPEN with an empty live editor (what a failed restore leaves): the floor is wiped. This is the bug.
  const open = savePath({ stateLoaded: true, floors: JSON.parse(JSON.stringify(real)) });
  open.api.snapFloor();
  assert.equal(open.api.floors()[0].bg, null);
  assert.equal(open.api.floors()[0].scale, null);
  assert.equal(open.api.floors()[0].devices.length, 0, "cameras gone — this is what 'survey data is not being saved' was");
  // Gate CLOSED: the same call is a no-op, so the saved data survives.
  const shut = savePath({ stateLoaded: false, floors: JSON.parse(JSON.stringify(real)) });
  shut.api.snapFloor();
  assert.equal(shut.api.floors()[0].bg, "IMG");
  assert.deepEqual(shut.api.floors()[0].scale, { ftW: 86, ftH: 60 });
  assert.equal(shut.api.floors()[0].devices.length, 2);
});

test("with the state loaded, a save writes BOTH localStorage and the server, and carries lastStep", () => {
  const real = [{ name: "Floor 1", bg: "IMG", started: true, scale: { ftW: 86, ftH: 60 }, devices: [] }];
  const { api, store, posted } = savePath({
    stateLoaded: true, floors: real, devices: [cam(1, "c1"), cam(2, "c2")],
    bgHasImage: true, bgData: "IMG", curFloorScale: { ftW: 86, ftH: 60 },
  });
  const json = api.serialize();
  const out = JSON.parse(json);
  assert.equal(out.floors[0].devices.length, 2, "the live cameras land on the floor");
  assert.deepEqual(out.floors[0].scale, { ftW: 86, ftH: 60 }, "and so does the scale");
  api.save();
  assert.equal(JSON.parse(store.value).floors[0].devices.length, 2);
  assert.equal(posted.length, 1, "the server is always written too — localStorage is only a cache");
  assert.equal(JSON.parse(posted[0]).floors[0].devices.length, 2);
});

// ---------------------------------------------------------------- the widget's wiring ---------------
test("the widget persists and reports the rail step, and reports a load failure", () => {
  assert.match(widget, /serialize\(\)\{[^}]*lastStep:railStep/, "serialize() stores the rail step as lastStep");
  assert.match(widget, /m\.cmd==="railStep"/, "the host can tell the widget which rail step it is on");
  assert.match(widget, /type:"iotSurveyStep"[\s\S]{0,400}lastStep:railStep/, "and the widget echoes it back on load");
  assert.match(widget, /loadFailed:restoreFailed/, "a failed restore is reported to the host, never swallowed");
});

test("restore() opens the save gate only after loadFloor", () => {
  const restore = extractFn(widget, "restore");
  const open = restore.lastIndexOf("stateLoaded=true");   // the second occurrence; the first is the nothing-saved early return
  const load = restore.indexOf("loadFloor(curFloor)");
  assert.ok(load > 0 && open > load, "stateLoaded is set AFTER loadFloor has mirrored floors[curFloor] into the editor");
  assert.match(restore, /catch\(e\)\{ failRestore\(\); return; \}/, "the catch no longer just re-renders the tabs");
  // A failed restore is not a dead end: the banner carries the way out, and the editor goes read-only.
  const fail = extractFn(widget, "failRestore");
  assert.match(fail, /restoreFailed=true; stateLoaded=false;/);
  assert.match(fail, /classList\.add\("frozen"/, "the editor is visibly read-only while every write is refused");
  assert.match(extractFn(widget, "frozen"), /RO \|\| submitted \|\| restoreFailed/);
  assert.match(extractFn(widget, "loadErr"), /loadErrFix/, "the banner carries 'Use the saved copy'");
  assert.match(extractFn(widget, "discardLocalCopy"), /iotSurveyDiscardLocal/, "which asks the host to drop this device's copy and re-seed");
});

test("the 'edited after submit' mark is on the SURVEY, not the session", () => {
  assert.match(extractFn(widget, "serialize"), /editedAfterSubmit:editedAfterSubmit/, "it rides in the saved blob");
  assert.match(extractFn(widget, "unsubmit"), /if\(submitted\) editedAfterSubmit=true/, "a reopen marks it");
  assert.match(extractFn(widget, "submit"), /editedAfterSubmit=false/, "a (re)submit clears it");
  // It survives a reopen, and it is off the approval fingerprint.
  const marked = JSON.stringify({ ...SAVED, editedAfterSubmit: true });
  assert.equal(surveyEditedAfterSubmit(marked), true);
  assert.equal(surveyEditedAfterSubmit(savedJson), false);
  assert.equal(toolFingerprint("survey2", marked), toolFingerprint("survey2", savedJson),
    "marking a survey edited must not void a customer approval");
  const { api } = widgetEnv({ stored: marked });
  api.restore();
  assert.equal(api.state().editedAfterSubmit, true, "and it comes back on reopen, not just within one session");
});

// ---------------------------------------------------------------- the load order -------------------
test("an EMPTY local copy no longer beats a server row that has the survey", () => {
  // The empty blob the old failed-restore path wrote: one placeholder floor, nothing in it.
  const emptyBlob = JSON.stringify({ floors: [{ name: "Floor 1", bg: null, devices: [], started: false }], curFloor: 0, step: 1 });
  assert.equal(survey2HasData(emptyBlob), false, "the placeholder blob reads as 'no content'");
  assert.equal(survey2HasData(savedJson), true, "a real survey reads as content");
  // seedToolData's guard is content-based, so the empty copy stops winning and the server row is read.
  assert.match(sync, /if \(!force && local != null && \(!recoverable \|\| toolHasData\(tool, local\)\)\)/,
    "local wins unless the tool has an exact emptiness test AND the local copy is empty");
  assert.match(sync, /toolHasData\(tool, fromServer\)/, "and the server copy replaces it only when the server's has content");
  assert.match(sync, /retryToolSync/, "a failed save can be retried from the badge");
  assert.match(sync, /_status\.failed = true/, "a real server rejection is reported, not swallowed");
});

test("the empty-local recovery is scoped to tools whose emptiness test is EXACT", () => {
  // mockupHasData counts only photos and names, so a mockup draft holding just `count` or `frame` edits
  // reads as "empty" — recovering over it would delete real local work. schedule has no test at all.
  assert.match(sync, /const EXACT_EMPTY = new Set\(\["survey2", "survey"\]\)/, "survey only");
  assert.equal(mockupHasData(JSON.stringify({ count: 6, frame: "iphone" })), false,
    "a real mockup draft can read as empty — which is exactly why it is out of scope");
  const i = sync.indexOf("const recoverable = EXACT_EMPTY.has(tool)");
  assert.ok(i > 0 && i < sync.indexOf("if (!force && local != null &&"), "the scope is decided before the guard");
});

test("'the server has nothing' and 'I couldn't ask the server' are different outcomes", () => {
  // They used to be the same `false`, so a device with no local copy on a flaky network concluded the
  // survey was new — and the first edit overwrote the real row.
  assert.match(sync, /const out = \{ seeded: false, serverError: false, hasLocal: false, localHasContent: false \}/);
  assert.match(sync, /if \(!r\?\.ok\) \{ out\.serverError = true; return null; \}/, "a non-ok read is an error, not emptiness");
  assert.match(sync, /catch \{ out\.serverError = true; return null; \}/, "and so is a thrown fetch");
  assert.match(sync, /return r\.saved\?\.data != null \? r\.saved\.data : "";\s*\/\/ "" = the server genuinely has nothing/);
  // The host refuses to mount the editor when there is nothing to read and nowhere to read it from.
  const host = readFileSync(new URL("../app/project/[accessId]/site-survey-widget.jsx", import.meta.url), "utf8");
  assert.match(host, /if \(seed\?\.serverError && !seed\?\.localHasContent\) \{ setLoadFail\(true\)/,
    "no server, no local survey content → do not open an editor over the survey");
  assert.match(host, /loadFail \? \(/, "and show the failure with a retry instead");
  assert.match(host, /iotSurveyDiscardLocal/, "the host owns discarding this device's unreadable copy");
  assert.match(host, /discardLocalToolData\(`iottechs_survey2_\$\{accessId\}`\)/);
  assert.match(sync, /export async function discardLocalToolData/, "which clears localStorage AND the IndexedDB mirror");
  assert.match(sync, /idbDel\(storageKey\)/);
});

// ---------------------------------------------------------------- the EIGHTH writer ----------------
// The host's own autosync. It runs on a 5s interval OUTSIDE the iframe, reads localStorage directly and
// POSTs it, so the widget's save gate never governed it. A corrupt local value (`{broken`) was mirrored
// into IndexedDB and POSTed over a real 8-camera survey — while the widget's banner said nothing had
// changed. Driven here for real: the module imports cleanly under bare Node (its window/indexedDB
// touches are all guarded), so `push()` can be exercised against stubbed globals.
const settle = () => new Promise((r) => setTimeout(r, 0));

function hostEnv(localValue) {
  const posted = [];
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  globalThis.localStorage = {
    getItem: () => localValue,
    setItem: () => {},
    removeItem: () => {},
  };
  globalThis.fetch = async (url, opts) => {
    if (!opts || opts.method !== "POST") return { json: async () => ({ ok: true, saved: { data: null } }) };   // the priming GET: server has nothing
    posted.push(JSON.parse(opts.body));
    return { json: async () => ({ ok: true, saved: { updated_at: 1 } }) };
  };
  return posted;
}

test("the host autosync REFUSES to POST a local copy the tool could not load", async () => {
  // The exact value from the live loss, plus the other corrupt shapes.
  for (const bad of ["{broken", "", "   ", "not json", '"a string"', "7", '{"floors":{"length":2}}']) {
    const posted = hostEnv(bad);
    const stop = startToolAutosync(`CORRUPT-${bad.length}-${bad.slice(0, 3)}`, "survey2", "k", { intervalMs: 60_000 });
    await settle(); await settle();
    stop();
    assert.deepEqual(posted, [], `the autosync must never POST ${JSON.stringify(bad)} over the server's survey`);
  }
});

test("the host autosync still POSTs a valid local copy — the gate didn't break saving", async () => {
  const posted = hostEnv(savedJson);
  const stop = startToolAutosync("VALID-1", "survey2", "k", { intervalMs: 60_000 });
  await settle(); await settle();
  stop();
  assert.equal(posted.length, 1, "one POST");
  assert.equal(posted[0].tool, "survey2");
  assert.equal(JSON.parse(posted[0].data).floors[0].devices.length, 2, "carrying both cameras");
});

test("the host autosync REFUSES an empty-but-VALID survey — `{\"floors\":[]}` is the second loss path", async () => {
  // This blob is valid JSON and restore() reads it happily, so it is NOT caught by the corruption test —
  // and it is exactly what the pre-fix failed-restore path wrote, so real devices hold one. Mirroring it
  // blanks a real survey just as surely as `{broken` did.
  for (const emptyBlob of [
    JSON.stringify({ floors: [], curFloor: 0, step: 1 }),
    JSON.stringify({ floors: [{ name: "Floor 1", bg: null, devices: [], started: false }], curFloor: 0 }),
  ]) {
    assert.equal(survey2HasData(emptyBlob), false, "it reads as empty");
    assert.equal(toolPayloadSendable("survey2", emptyBlob), false, "so a host MIRROR must not send it");
    const posted = hostEnv(emptyBlob);
    const stop = startToolAutosync(`EMPTY-${emptyBlob.length}`, "survey2", "k", { intervalMs: 60_000 });
    await settle(); await settle();
    stop();
    assert.deepEqual(posted, [], "nothing POSTed");
  }
});

test("a DELIBERATE clear still reaches the server — refused by inference, allowed by intent", () => {
  // Refusing every empty survey would leave a deleted survey live on the customer's portal forever. So
  // the clear is allowed, but it has to SAY so: only the TOOL sends allowEmpty, because only the tool
  // knows its state was actually loaded (its own save gate guarantees it).
  // The intent is declared per-write by a real UI action, never standing. A flag that is always on is
  // not a guard — the whole point is that an empty blob arriving by ACCIDENT must still be refused.
  assert.match(widget, /data:json,allowEmpty:intent/, "the widget's pushServer sends the declared intent");
  assert.match(extractFn(widget, "pushServer"), /var intent=clearIntent; clearIntent=false;/, "one declared clear authorizes exactly one write");
  assert.match(extractFn(widget, "deleteFloor"), /clearIntent=true/, "deleting a floor can legitimately empty the survey");
  assert.match(extractFn(widget, "startOverFloor"), /clearIntent=true; flushNow\(\)/, "and so can Start Over on the only floor");
  assert.ok(!/clearIntent=true/.test(extractFn(widget, "save")) && !/clearIntent=true/.test(extractFn(widget, "serialize")),
    "but an ordinary save never declares it");
  // The host mirror's body may carry the B14 baseRev (a version claim), but NEVER allowEmpty: a
  // mirror cannot tell a deliberate clear from a stale copy, so it must not be able to declare one.
  assert.match(sync, /body: JSON\.stringify\(\{ accessId, tool, data: raw, baseRev:/,
    "the host POST body is accessId/tool/data plus the version claim");
  assert.doesNotMatch(postBody(sync), /allowEmpty/, "and no intent flag in the BODY — a mirror cannot declare a clear");
  // And the server honours the flag rather than inferring intent from emptiness.
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  assert.match(route, /function emptyOverContent\(accessId, tool, data, allowEmpty\)/);
  assert.match(route, /if \(allowEmpty\) return false;/, "declared intent → allowed");
  assert.match(route, /if \(toolHasData\(tool, data\)\) return false;/, "a non-empty write is never blocked");
  assert.match(route, /return !!\(existing\?\.data && toolHasData\(tool, existing\.data\)\);/, "only an empty-over-CONTENT write is refused");
  assert.match(route, /if \(emptyOverContent\(accessId, tool, data, allowEmpty\)\) \{/);
  // Only the survey tools are in scope — a mockup or schedule clear is untouched.
  assert.match(route, /if \(tool !== "survey2" && tool !== "survey"\) return false;/);
  // Both server write paths agree, or the guard is only as strong as the path a caller picks.
  const actions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  // allowEmpty is still an explicit opt-in on the action; B14 added an optional baseRev beside it.
  assert.match(actions, /saveToolDataAction\(accessId, tool, data, \{ allowEmpty = false[^)]*\} = \{\}\)/);
  assert.match(actions, /Refused: that would replace the saved survey with an empty one\./);
  assert.equal((actions.match(/Refused: that would replace the saved survey with an empty one\./g) || []).length, 1);
});

test("every writer of the survey2 ROW is enumerated — a new one can't appear unnoticed", () => {
  // This is the drift guard the whole section needed: writes to this row kept arriving from places
  // nobody had listed. The four audited server-side writers are:
  //   /api/tool-data POST + saveToolDataAction  → role check + empty-over-content refusal
  //   setSurveyCameraPhoto + setSurveyCameraName → mutate ONE field of an existing camera
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  const sites = [...db.matchAll(/saveToolData\((?:accessId|[A-Za-z.]+), "survey2"/g)];
  assert.equal(sites.length, 2, "only the two camera-list mutators write survey2 from lib/db.js");
  for (const fn of ["setSurveyCameraPhoto", "setSurveyCameraName"]) {
    const body = db.slice(db.indexOf(`export function ${fn}(`), db.indexOf('"camera-list");', db.indexOf(`export function ${fn}(`)));
    // Each refuses rather than clobbers: a parse failure writes nothing, and the target must already
    // exist in the blob — so neither can blank a survey, only change one field of one camera.
    assert.match(body, /catch \{ return null; \}/, `${fn} refuses an unreadable row instead of rewriting it`);
    assert.match(body, /return null;\s*\/\/ (moved\/removed|cid no longer exists) since read → refuse rather than clobber|if \(!hit\) return null;/,
      `${fn} requires an existing camera before writing`);
  }
  // The HTTP/action surface: both paths carry the refusal, and no third one writes the row.
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  assert.equal((route.match(/saveToolData\(/g) || []).length, 1);
  assert.match(route, /if \(emptyOverContent\(accessId, tool, data, allowEmpty\)\) \{/);
  assert.match(actions, /if \(!allowEmpty && \(tool === "survey2" \|\| tool === "survey"\)/);
});

test("the 'not saving' badge is per project:tool, not global", () => {
  // The status object is shared by every tool's autosync (survey2, mockup, schedule), so a global flag
  // meant the schedule's loop could clear the survey's warning — or raise one for the wrong tool.
  assert.match(sync, /blockedKeys: new Set\(\)/);
  assert.match(sync, /blocked: _status\.blockedKeys\.size \? BLOCKED_MSG : null/);
  assert.match(sync, /_status\.blockedKeys\.add\(`\$\{accessId\}:\$\{tool\}`\)/, "suspend blocks one key");
  assert.match(sync, /if \(_status\.blockedKeys\.delete\(mapKey\)\) emitStatus\(\);\s*\/\/ a \(re\)start clears only THIS key/);
});

test("the second loss path end to end: an empty local blob + an unreadable server does NOT open an editor", async () => {
  // 1. this device holds `{"floors":[]}`  2. the server has the real survey  3. the GET fails.
  // seedToolData reports hasLocal TRUE (so the old `serverError && !hasLocal` check did not fire) but
  // localHasContent FALSE, which is the same unknown state as having no copy at all.
  const emptyBlob = JSON.stringify({ floors: [], curFloor: 0, step: 1 });
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: () => emptyBlob, setItem: () => {}, removeItem: () => {} };
  globalThis.fetch = async () => { throw new Error("offline"); };          // the server cannot be read
  const seed = await seedToolData("SECOND-PATH", "survey2", "k");
  assert.equal(seed.hasLocal, true, "there IS a local copy…");
  assert.equal(seed.localHasContent, false, "…but it holds no survey");
  assert.equal(seed.serverError, true, "and the server could not be read");
  assert.ok(seed.serverError && !seed.localHasContent, "→ the host must refuse to mount the tool");
  const host = readFileSync(new URL("../app/project/[accessId]/site-survey-widget.jsx", import.meta.url), "utf8");
  assert.match(host, /if \(seed\?\.serverError && !seed\?\.localHasContent\) \{ setLoadFail\(true\)/,
    "and it checks BOTH halves, not just hasLocal");
  // Belt and braces: even if an editor did mount and write that blob, the mirror would not send it.
  assert.equal(toolPayloadSendable("survey2", emptyBlob), false);
});

test("postToolData — the gate every host writer shares — refused / empty / good", async () => {
  // flushDraft and retryToolSync both reach the server only through this, so driving it covers them.
  const cases = [
    ["{broken", false, "corrupt"],
    ["", false, "blank"],
    ['{"floors":{"length":2}}', false, "unreadable floors"],
    ['{"floors":[],"curFloor":0,"step":1}', false, "empty-but-valid — the second loss path"],
    [savedJson, true, "a real survey"],
  ];
  for (const [raw, shouldSend, label] of cases) {
    const posted = hostEnv(raw);
    const r = await postToolData("GATE-1", "survey2", raw);
    if (shouldSend) {
      assert.equal(posted.length, 1, `${label} → one POST`);
      assert.equal(r.ok, true);
    } else {
      assert.deepEqual(posted, [], `${label} → no POST`);
      assert.equal(r.refused, true, `${label} → reported as refused, not as a success`);
      assert.ok(r.error, "with a message the caller can show");
    }
  }
});

test("retryToolSync cannot re-POST a bad local copy on demand", async () => {
  // The "Save failed — Retry" button this section added is a host writer too: it flushes every running
  // autosync, so without the gate it is a one-click way to push a corrupt copy over the server row.
  const posted = hostEnv("{broken");
  const stop = startToolAutosync("RETRY-1", "survey2", "k", { intervalMs: 60_000 });
  await settle(); await settle();
  retryToolSync();
  await settle(); await settle();
  stop();
  assert.deepEqual(posted, [], "Retry refuses the same value the interval refused");
  // And it still works for a good one.
  const ok = hostEnv(savedJson);
  const stop2 = startToolAutosync("RETRY-2", "survey2", "k", { intervalMs: 60_000 });
  await settle(); await settle();
  stop2();
  assert.equal(ok.length, 1, "a legitimate retry still reaches the server");
});

test("flushDraft — the submit path — routes through the gate and reports a refusal", () => {
  // The worst place to skip it: section L put flushDraft on the "Edit survey" path
  // (submitTool → flushDraft → submitToolAction), so it runs BEFORE the unlock permission check and is
  // what the lock banner's own way-forward button calls.
  const approve = readFileSync(new URL("../app/project/[accessId]/survey-approve.jsx", import.meta.url), "utf8");
  assert.match(approve, /const r = await postToolData\(accessId, d\.tool, raw\);/);
  assert.equal((approve.match(/fetch\("\/api\/tool-data"/g) || []).length, 0, "no raw fetch of its own left");
  assert.match(approve, /if \(r\?\.refused\) \{/);
  assert.match(approve, /the saved version is untouched/, "and it says the saved copy is safe, which is now true");
  // flushDraft runs ahead of the permission check, so the refusal has to come from the gate, not the role.
  const flush = approve.slice(approve.indexOf("async function flushDraft"), approve.indexOf("export async function submitTool"));
  assert.ok(flush.indexOf("postToolData") < flush.indexOf("submitToolAction") || !flush.includes("submitToolAction"));
});

test("a widget load failure suspends the host autosync for that key", async () => {
  const posted = hostEnv(savedJson);          // a VALID local copy, so only the suspension can stop it
  const stop = startToolAutosync("SUSPEND-1", "survey2", "k", { intervalMs: 60_000 });
  await settle(); await settle();
  stop();
  assert.equal(posted.length, 1, "baseline: it does push");
  // Now the widget reports it could not read this device's copy.
  const posted2 = hostEnv(savedJson);
  const stop2 = startToolAutosync("SUSPEND-2", "survey2", "k", { intervalMs: 60_000 });
  suspendToolSync("SUSPEND-2", "survey2");
  await settle(); await settle();
  retryToolSync();                             // even an explicit Retry must not resurrect it
  await settle(); await settle();
  stop2();
  assert.deepEqual(posted2, [], "suspended → the host stops writing underneath the banner");
  // The host consumes the message the widget already sent.
  const host = readFileSync(new URL("../app/project/[accessId]/site-survey-widget.jsx", import.meta.url), "utf8");
  assert.match(host, /iotSurveyLoadFailed"\) \{ suspendToolSync\(accessId, "survey2"\); return; \}/);
});

test("ONE validated host POST — every host-side writer of a tool blob goes through postToolData", () => {
  // The enumerated host writers: the 5s interval, the `online` reconnect flush, the Retry button (all
  // three are the same push()), and survey-approve's flushDraft.
  assert.match(sync, /export async function postToolData/);
  assert.match(sync, /if \(!toolPayloadSendable\(tool, raw\)\) return \{ refused: true/, "the gate is INSIDE postToolData");
  assert.doesNotMatch(postBody(sync), /allowEmpty/, "and a host mirror never declares clear-intent");
  assert.match(sync, /\b(?:const|let) r = await postToolData\(accessId, tool, cur\);/, "push() goes through it");
  const approve = readFileSync(new URL("../app/project/[accessId]/survey-approve.jsx", import.meta.url), "utf8");
  assert.match(approve, /const r = await postToolData\(accessId, d\.tool, raw\);/, "flushDraft goes through it");
  assert.match(approve, /if \(r\?\.refused\) \{/, "and reports the refusal instead of reporting a sync");
  // Exactly one POST site each, so there is no second raw fetch to forget.
  assert.equal((sync.match(/fetch\("\/api\/tool-data"/g) || []).length, 1, "tool-sync has one POST site");
  assert.equal((approve.match(/fetch\("\/api\/tool-data"/g) || []).length, 0, "flushDraft has none of its own");
  // The autosync's own guard refuses BEFORE the IndexedDB mirror — mirroring first is what made the
  // corruption durable as well as remote.
  const gatePos = sync.indexOf("if (!toolPayloadSendable(tool, cur))");
  assert.ok(gatePos > 0 && gatePos < sync.indexOf("idbSet(storageKey, cur)"), "refused before the mirror");
  assert.ok(gatePos < sync.indexOf("await postToolData(accessId, tool, cur)"), "and before the POST");
  // Retry cannot resurrect a suspended key, and the user is never told "Saved" while nothing is sent.
  assert.match(sync, /if \(stopped \|\| readOnly \|\| inFlight \|\| _suspended\.has\(mapKey\) \|\| _conflicts\.has\(mapKey\)\) return;/);
  // A `stale` refusal (B14) must never be retried with the same bytes: the stale part IS the claim we
  // send, so an identical resend can only fail again — which is how one outside camera write (via
  // /api/project-cameras) silently stopped a survey saving for the life of the page, 5s at a time.
  assert.match(sync, /if \(r\?\.stale\) \{/, "a stale refusal is handled on its own, not as a generic failure");
  assert.match(sync, /const next = await reconcileStale\(accessId, tool, cur\);/, "it reconciles instead");
  assert.match(sync, /if \(next == null\) \{\s*\n\s*_conflicts\.add\(mapKey\);/, "and an unreconcilable conflict STOPS the key");
  const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  assert.ok(sp.indexOf("if (st.blocked) return (") < sp.indexOf("if (st.failed) return ("), "'Not saving' outranks every other badge state");
  assert.ok(sp.indexOf("if (st.conflict) return (") < sp.indexOf("if (st.failed) return ("), "'Changed elsewhere' (Reload) outranks 'Save failed' (Retry) — Retry is the wrong action for a stale claim");
  assert.ok(sp.indexOf("if (st.blocked) return (") < sp.indexOf("if (st.online && st.pending === 0)"), "and it is never replaced by 'Saved'");
});

test("every /api/tool-data POST site in the WIDGET is enumerated and gated", () => {
  // The old assertion claimed pushServer was the single route — it wasn't: loadSample had its own raw
  // fetch. This audits every POST site in the widget instead of asserting a single one exists.
  const sites = [...widget.matchAll(/fetch\("\/api\/tool-data"/g)].map((m) => m.index);
  assert.equal(sites.length, 1, "exactly one POST site in the widget — inside pushServer");
  const ps = extractFn(widget, "pushServer");
  assert.ok(ps.includes('fetch("/api/tool-data"'), "and that site IS pushServer");
  assert.match(ps, /if\(RO\|\|!PID\|\|!json\) return; if\(!stateLoaded\) return;/, "which keeps the RO guard and the save gate");
  // loadSample used to post directly; it now routes through pushServer.
  const ls = extractFn(widget, "loadSample");
  assert.ok(!ls.includes('fetch("/api/tool-data"'), "loadSample no longer has its own route to the server");
  assert.match(ls, /pushServer\(lastJson=serialize\(\)\)/);
});

test("toolPayloadSendable: validity, not content", () => {
  for (const bad of [null, undefined, 7, {}, "", "  ", "{broken", "not json", '"str"', "null", "[1,2]", '{"floors":{"length":2}}']) {
    assert.equal(toolPayloadSendable("survey2", bad), false, `${JSON.stringify(bad)} must never be sent`);
  }
  assert.equal(toolPayloadSendable("survey2", savedJson), true);
  assert.equal(toolPayloadSendable("survey2", "x".repeat(8_000_001)), false, "over the server's 8MB ceiling");
  // The strict floors check is survey-only; another tool's blob is judged on parseability alone.
  assert.equal(toolPayloadSendable("mockup", '{"floors":{"length":2}}'), true);
  assert.equal(toolPayloadSendable("mockup", "{broken"), false);
  assert.equal(toolPayloadSendable("mockup", JSON.stringify({ count: 6, frame: "iphone" })), true,
    "a mockup draft that reads as 'empty' is still valid and must still sync");
});

test("a tech who may unlock the survey may also save it and send it back", () => {
  // Unlock without write is silent loss wearing a different hat: the acceptance is deleted, the edits
  // live only in localStorage, and the autosync latches read-only on the refusal.
  for (const cap of ["survey.edit", "survey.unlock", "survey.submit"]) {
    assert.equal(can("tech", cap), true, `tech must have ${cap}`);
    for (const role of ["customer", "vendor", "readonly"]) assert.equal(can(role, cap), false, `${role} must not have ${cap}`);
  }
  // Both server write paths agree, and neither widens any OTHER tool.
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  assert.match(route, /tool === "survey2" \|\| tool === "survey"\s*\?\s*can\(tok\.role, "survey\.edit"\)/);
  assert.match(route, /: \["admin", "manager", "sales"\]\.includes\(tok\.role\)/, "every other sync tool stays office-only");
  const actions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  assert.match(actions, /tool === "survey" \|\| tool === "survey2" \? ROLE_KEYS\.filter\(\(r\) => can\(r, "survey\.edit"\)\)/);
  // Submit/unlock are checked by capability, so the button rendering is never the gate.
  assert.match(actions, /const cap = on \? "survey\.submit" : "survey\.unlock";/);
  assert.match(actions, /if \(!can\(tok\.role, cap\)\)/);
  // A refusal must reach the UI, not be swallowed into a banner that lies.
  const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  assert.match(sp, /if \(r && r\.error\) \{ setLockErr\(r\.error\); return; \}/);
  assert.ok(sp.indexOf("if (r && r.error) { setLockErr(r.error); return; }") < sp.indexOf("setReopened(true);"),
    "the mark is only set once the server actually agreed");
  const gw = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
  assert.ok(!/onUnsubmitTool=\{viewOnly \? null : async \(\) => \{ const r = await submitTool\(lp\.access_id, "site_survey", false\); if \(r\?\.acceptances\) onApprove\(r\.acceptances\); \}\}/.test(gw),
    "the gateway handlers return the result so the planner can see an error");
  assert.match(gw, /if \(r\?\.acceptances\) onApprove\(r\.acceptances\); return r; \}\}/);
});

test("the Devices empty state keys off the LIVE lock, not a once-fetched 'db has devices' flag", () => {
  // Deleting the last camera on an UNSUBMITTED survey must not make the strip claim it was submitted.
  const sd = readFileSync(new URL("../app/project/[accessId]/survey-devices.jsx", import.meta.url), "utf8");
  assert.match(sd, /\{!total && \(locked\n/, "the branch is `locked` alone");
  assert.ok(!sd.includes("dbHasDevices"), "the stale flag is gone entirely");
  assert.match(sd, /Submitted\{canUnlock && onUnlock \?/, "locked → say so and offer the unlock");
  assert.match(sd, /No cameras yet — tap <b>Add camera<\/b> to start\./, "unlocked and genuinely empty → the normal prompt");
  const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  assert.ok(!sp.includes("dbHasDevices"), "and the planner no longer computes or passes it");
  // The roster fallback is what actually keeps a submitted survey's devices on screen.
  assert.match(sp, /const roster = liveRoster\.length \? liveRoster : savedRoster;/);
});

test("the unlock control exists exactly once", () => {
  const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  assert.ok(!sp.includes("syp-nav-unsub"), "the second Unsubmit on Approval is gone");
  assert.equal((sp.match(/onClick=\{editSurvey\}/g) || []).length, 1, "one 'Edit survey' button, in the lock banner");
});

test("the new chrome uses design tokens, never hand-typed colour", () => {
  const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  for (const rule of ["syp-lockbar", "syp-lockbar-act", "syp-sync.ok"]) {
    const line = sp.split("\n").find((l) => l.startsWith(`.${rule}{`) || l.startsWith(`.${rule}.`));
    assert.ok(line, `${rule} is styled`);
    assert.ok(!/#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])/.test(line.replace(/var\(--[a-z-]+,\s*#[0-9a-fA-F]{3,6}\)/g, "")),
      `${rule} must take its colour from a token: ${line}`);
  }
  // The widget's own banner uses the widget's token set, and de-hardcodes the pre-existing save banner too.
  assert.match(widget, /--danger:#b23b3b/, "one danger token in the widget's :root");
  assert.match(widget, /#saveErr\{[^}]*background:var\(--danger\)/);
  assert.match(widget, /#loadErr\{[^}]*background:var\(--danger\)/);
  assert.ok(!extractFn(widget, "loadErr").includes("cssText"), "no inline style block / font stack in JS");
});

test("a single corrupt floor costs that floor's normalization, not the whole survey", () => {
  const normFloor = extractFn(widget, "normFloor");
  assert.match(normFloor, /catch\(e\)\{ return f; \}/, "normFloor falls back to the raw floor instead of aborting the restore");
  const restore = extractFn(widget, "restore");
  assert.match(restore, /Array\.isArray\(st\.floors\)/, "a non-array `floors` can no longer throw on .forEach");
});
