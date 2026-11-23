// Group 1 (data) — device identity, orphan cable runs, Placement undo.
//
// Every test here RUNS the widget's real functions (docs/survey-rules.md, "The test rule").
// The functions are extracted from the widget source and called with their collaborators stubbed,
// the same technique as survey-place-device.test.mjs. A test that only matched source text is what
// let `placeAt` ship completely broken past 1,977 passing tests.
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

// ---------------------------------------------------------------- identity

// The real ordinal helpers, running against a state object the test controls.
function ordinals({ devices = [], floors = [{ devices: [] }], curFloor = 0, reAddPool = null, groups = {} } = {}) {
  const S = { devices, floors, curFloor, reAddPool, groups };
  return new Function("S", `
    var devices=S.devices, floors=S.floors, curFloor=S.curFloor, reAddPool=S.reAddPool;
    function catSafe(k){ return { group:{ key:(S.groups[k]||k), letter:(S.groups[k]||k).charAt(0).toUpperCase() } }; }
    ${extractFn("ordFromTag")}
    ${extractFn("ordFromName")}
    ${extractFn("maxOrd")}
    ${extractFn("nextGroupOrd")}
    ${extractFn("nextTypeOrd")}
    return { nextGroupOrd:nextGroupOrd, nextTypeOrd:nextTypeOrd, ordFromTag:ordFromTag, ordFromName:ordFromName };
  `)(S);
}
const CAM = { key: "cctv", letter: "C" };

test("THE BUG: delete a device, add another — the new one must not reuse the deleted identity", () => {
  // Four cameras, IC2..IC5 / "Camera 1".."Camera 4", then IC4 is deleted.
  const devices = [
    { k: "cam", tag: "IC2", name: "Camera 1" },
    { k: "cam", tag: "IC3", name: "Camera 2" },
    { k: "cam", tag: "IC5", name: "Camera 4" },   // IC4 / "Camera 3" has been deleted
  ];
  const o = ordinals({ devices, groups: { cam: "cctv" } });
  // count+1 gave 4 here → "IC4"?? no: 3 cams + 1 = 4 → tag IC4 but NAME "Camera 4", which already
  // exists. The live reproduction minted IC5/"Camera 4" exactly this way.
  assert.equal(o.nextGroupOrd(CAM), 6, "tag ordinal is the highest in use (5) + 1");
  assert.equal(o.nextTypeOrd("cam"), 5, "name ordinal is the highest in use (4) + 1");
  const newTag = "I" + CAM.letter + o.nextGroupOrd(CAM), newName = "Camera " + o.nextTypeOrd("cam");
  assert.ok(!devices.some(d => d.tag === newTag), "the minted tag collides with nothing: " + newTag);
  assert.ok(!devices.some(d => d.name === newName), "the minted name collides with nothing: " + newName);
});

test("a count-based ordinal would have collided — proving this test has teeth", () => {
  const devices = [{ k: "cam", tag: "IC2", name: "Camera 1" }, { k: "cam", tag: "IC3", name: "Camera 2" },
                   { k: "cam", tag: "IC5", name: "Camera 4" }];
  const countBasedName = "Camera " + (devices.length + 1);     // the old formula
  assert.ok(devices.some(d => d.name === countBasedName),
    "the OLD count+1 rule really does produce an existing name here");
});

test("ordinals count per group for tags and per kind for names, across floors", () => {
  const o = ordinals({
    devices: [{ k: "cam", tag: "IC9", name: "Camera 9" }],
    floors: [{ devices: [] }, { devices: [{ k: "cam", tag: "IC12", name: "Camera 12" }] }],
    curFloor: 0, groups: { cam: "cctv", nvr: "cctv", spk: "audio" },
  });
  assert.equal(o.nextGroupOrd(CAM), 13, "another floor's higher tag still counts");
  assert.equal(o.nextTypeOrd("cam"), 13, "…and so does its name");
  assert.equal(o.nextTypeOrd("nvr"), 1, "a kind with none yet starts at 1");
  assert.equal(o.nextGroupOrd({ key: "audio", letter: "A" }), 1, "a different group has its own sequence");
});

test("a legacy device with no tag cannot be minted onto a tag that appears LATER in the same load", () => {
  // reAddPool is the whole stored list during loadFloor. Without it the first (tagless) record would
  // be handed IC1 and then the stored IC1 would load on top of it.
  const pool = [{ k: "cam", name: "Camera 1" }, { k: "cam", tag: "IC1", name: "Camera 1" }];
  const o = ordinals({ devices: [], reAddPool: pool, groups: { cam: "cctv" } });
  assert.equal(o.nextGroupOrd(CAM), 2, "the not-yet-loaded IC1 is already visible to the mint");
});

test("ordinal parsing handles the real tag and name shapes", () => {
  const o = ordinals({});
  assert.equal(o.ordFromTag({ tag: "IC7" }), 7);
  assert.equal(o.ordFromTag({ tag: "" }), 0, "no tag is not a number");
  assert.equal(o.ordFromTag({}), 0, "a missing tag never throws");
  assert.equal(o.ordFromName({ name: "Camera 12" }), 12);
  assert.equal(o.ordFromName({ name: "Front Door" }), 0, "a hand-typed name holds no ordinal");
});

// ------------------------------------------------------- orphan cable runs

// The real cutRunsFor, running against a floor the test owns.
function runCutter(floor, devicesArr = []) {
  const S = { floors: [floor], curFloor: 0, devices: devicesArr, rendered: 0 };
  return new Function("S", `
    var floors=S.floors, curFloor=S.curFloor, devices=S.devices;
    function rtDevKey(d){ return d ? (d.cid || ("id"+d.id)) : ""; }
    function renderRoutes(){ S.rendered++; }
    function renderRouteBar(){}
    ${extractFn("cutRunsFor")}
    return cutRunsFor;
  `)(S);
}

test("deleting a device takes its cable runs with it — no orphan runs", () => {
  const cam = { id: 3, cid: "cabc", k: "cam" };
  const floor = { routes: [
    { id: "r1", dev: "cabc" }, { id: "r2", dev: "cother" },
    { id: "r3", dev: "cabc" }, { id: "r4", dev: "id9" },
  ] };
  const cut = runCutter(floor, [cam])(cam);
  assert.deepEqual(cut.map(r => r.id), ["r1", "r3"], "both of that camera's runs were cut");
  assert.deepEqual(floor.routes.map(r => r.id), ["r2", "r4"], "and only those");
  const live = new Set(["cother", "id9"]);
  assert.ok(floor.routes.every(r => live.has(r.dev)), "no run points at a device that is gone");
});

test("a device with no runs cuts nothing, and a floor with no routes does not throw", () => {
  const floor = { routes: [{ id: "r1", dev: "cother" }] };
  assert.deepEqual(runCutter(floor, [])({ id: 1, cid: "cnone" }), []);
  assert.equal(floor.routes.length, 1);
  assert.deepEqual(runCutter({}, [])({ id: 1, cid: "c1" }), [], "no routes array at all");
  assert.deepEqual(runCutter({ routes: [] }, [])(null), [], "no device");
});

test("a non-camera's runs are cut by its id key", () => {
  const nvr = { id: 1, cid: null, k: "nvr" };
  const floor = { routes: [{ id: "r1", dev: "id1" }, { id: "r2", dev: "id2" }] };
  assert.deepEqual(runCutter(floor, [nvr])(nvr).map(r => r.id), ["r1"]);
  assert.deepEqual(floor.routes.map(r => r.id), ["r2"]);
});

// ------------------------------------------------------- Placement history

// The real pHist stack, driven through its own functions.
function history(initialDevices = [], initialRoutes = []) {
  const S = { devices: initialDevices.map(d => ({ ...d })), floors: [{ routes: initialRoutes.map(r => ({ ...r })) }],
    curFloor: 0, devSeq: 100, selId: null, RO: false, frozenFlag: false, mounted: [], removedNodes: 0 };
  const api = new Function("S", `
    var devices=S.devices, floors=S.floors, curFloor=S.curFloor, devSeq=S.devSeq, selId=S.selId, RO=S.RO;
    function frozen(){ return S.frozenFlag; }
    var work={ querySelectorAll:function(){ return []; } };
    function mountDevice(d){ S.mounted.push(d.id); }
    function renderRoutes(){} function renderRouteBar(){} function renderPanel(){}
    function updateCount(){} function reportDevices(){} function renderUnplacedTray(){}
    function queueSave(){} function updateCamBtns(){}
    ${extractFn("pSnap")}
    ${extractFn("pHistReset")}
    ${extractFn("pHistPush")}
    ${extractFn("pCanUndo")}
    ${extractFn("pCanRedo")}
    ${extractFn("pApply")}
    ${extractFn("pHistUndo")}
    ${extractFn("pHistRedo")}
    var pHist=[], pHi=-1, pHistFloor=-1;
    return {
      reset:pHistReset, push:pHistPush, undo:pHistUndo, redo:pHistRedo,
      canUndo:pCanUndo, canRedo:pCanRedo,
      devices:function(){ return devices; }, routes:function(){ return floors[curFloor].routes; },
      depth:function(){ return { len:pHist.length, i:pHi }; },
      setDevices:function(v){ devices=v; }, setRoutes:function(v){ floors[curFloor].routes=v; },
      lock:function(which){ if(which==="RO") RO=true; else S.frozenFlag=true; }
    };
  `)(S);
  api.reset();
  api.state = S;
  return api;
}

test("THE BUG: undo after a MOVE puts the device back — it does not delete a different one", () => {
  const h = history([{ id: 1, tag: "IC1", name: "NVR 1", x: 10, y: 10 },
                     { id: 2, tag: "IC2", name: "Camera 1", x: 20, y: 20 },
                     { id: 3, tag: "IC3", name: "Camera 2", x: 30, y: 30 }]);
  h.devices()[1].x = 77; h.devices()[1].y = 88;      // move IC2
  h.push();
  assert.equal(h.canUndo(), true);
  h.undo();
  const after = h.devices();
  assert.equal(after.length, 3, "no device was deleted — the old undo dropped one here");
  assert.deepEqual(after.map(d => d.tag), ["IC1", "IC2", "IC3"], "and the SAME three are present");
  const moved = after.find(d => d.tag === "IC2");
  assert.deepEqual([moved.x, moved.y], [20, 20], "the move itself was reversed");
});

test("undo/redo reverses an add, a delete and a rename, in order", () => {
  const h = history([{ id: 1, tag: "IC1", name: "Camera 1", x: 1, y: 1 }]);
  h.setDevices(h.devices().concat([{ id: 2, tag: "IC2", name: "Camera 2", x: 2, y: 2 }])); h.push();
  h.devices()[0].name = "Front Door"; h.push();
  h.setDevices(h.devices().filter(d => d.id !== 2)); h.push();

  assert.deepEqual(h.devices().map(d => d.name), ["Front Door"]);
  h.undo();  assert.deepEqual(h.devices().map(d => d.name), ["Front Door", "Camera 2"], "the delete came back");
  h.undo();  assert.deepEqual(h.devices().map(d => d.name), ["Camera 1", "Camera 2"], "the rename reversed");
  h.undo();  assert.deepEqual(h.devices().map(d => d.name), ["Camera 1"], "the add reversed");
  assert.equal(h.canUndo(), false, "and that is the beginning of this step's history");
  h.redo(); h.redo(); h.redo();
  assert.deepEqual(h.devices().map(d => d.name), ["Front Door"], "redo walks all the way forward again");
});

test("a delete and its cascaded cable runs undo together, as ONE step", () => {
  const h = history([{ id: 1, cid: "ca", tag: "IC1" }, { id: 2, cid: "cb", tag: "IC2" }],
                    [{ id: "r1", dev: "ca" }, { id: "r2", dev: "cb" }]);
  h.setDevices(h.devices().filter(d => d.cid !== "cb"));
  h.setRoutes(h.routes().filter(r => r.dev !== "cb"));     // the cascade cutRunsFor performs
  h.push();
  assert.deepEqual(h.routes().map(r => r.id), ["r1"]);
  h.undo();
  assert.deepEqual(h.devices().map(d => d.tag), ["IC1", "IC2"], "the device is back");
  assert.deepEqual(h.routes().map(r => r.id), ["r1", "r2"], "and its cable with it, in the same undo");
});

test("an action that changes nothing is not a history step", () => {
  const h = history([{ id: 1, tag: "IC1" }]);
  const before = h.depth();
  h.push(); h.push();
  assert.deepEqual(h.depth(), before, "identical state never grows the stack");
  assert.equal(h.canUndo(), false);
});

test("a new action after an undo drops the redo branch", () => {
  const h = history([{ id: 1, tag: "IC1" }]);
  h.setDevices(h.devices().concat([{ id: 2, tag: "IC2" }])); h.push();
  h.undo();
  assert.equal(h.canRedo(), true);
  h.setDevices(h.devices().concat([{ id: 3, tag: "IC3" }])); h.push();
  assert.equal(h.canRedo(), false, "the abandoned future is gone");
  assert.deepEqual(h.devices().map(d => d.tag), ["IC1", "IC3"]);
});

test("a read-only or submitted survey records nothing and undoes nothing (R9)", () => {
  for (const which of ["RO", "frozen"]) {
    const h = history([{ id: 1, tag: "IC1" }]);
    h.setDevices(h.devices().concat([{ id: 2, tag: "IC2" }]));
    h.push();                                            // recorded while still editable
    assert.equal(h.canUndo(), true, which + ": recorded before locking");
    h.lock(which);
    h.setDevices(h.devices().concat([{ id: 3, tag: "IC3" }]));
    const depth = h.depth();
    h.push();
    assert.deepEqual(h.depth(), depth, which + ": a locked survey records no history");
    h.undo();
    assert.deepEqual(h.devices().map(d => d.tag), ["IC1", "IC2", "IC3"],
      which + ": and undo is refused rather than rewriting a locked survey");
  }
});
