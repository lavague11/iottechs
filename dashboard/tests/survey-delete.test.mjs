// SECTIONS B + C — delete a device with an X (Undo for 5s, cids untouched) and delete the ONLY floor.
// The widget's real functions are brace-extracted and run in a vm against stubbed state, so a revert of
// the feature fails these (they are not source greps, except where the guard is a message-handler order).
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { deleteDeviceCmd, undoDeleteCmd, UNDO_MS } from "../lib/survey-delete.js";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const roster = readFileSync(new URL("../app/project/[accessId]/survey-devices.jsx", import.meta.url), "utf8");
const planner = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");

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

// A sandbox holding the widget's real device/floor/delete functions over stubbed DOM + state.
function world({ submitted = false, RO = false, floors, curFloor = 0 } = {}) {
  const posts = [];
  const cam = (n) => ({ id: n, k: "cam", x: n * 10, y: n * 5, tag: "IC" + n, name: "Camera " + n, cid: "c" + n, placed: true, photo: null });
  const sb = {
    posts, RO, submitted, restoreFailed: false, PID: "P1", stateLoaded: true, selId: null,
    devices: [1, 2, 3, 4, 5].map(cam), curFloor,
    floors: null, clearIntent: false, mounted: [],
    document: { getElementById: () => null },
    fetch: (url, o) => { posts.push(JSON.parse(o.body)); return { then() { return { then() { return { catch() {} }; }, catch() {} }; } }; },
    renderPanel() {}, updateCount() {}, reportDevices() {}, renderUnplacedTray() {}, queueSave() {},
    mountDevice(d) { sb.mounted.push(d.id); },
    devSeq: 5,
    // the widget's reAdd, reduced: a NEW runtime id + a count-based tag, cid carried by the record
    reAdd(sd) { sb.devSeq++; const d = { ...sd, id: sb.devSeq, tag: "IX" + sb.devSeq }; sb.devices.push(d); sb.mounted.push(d.id); },
    renderDevice() {},
    snapFloor() { sb.floors[sb.curFloor].devices = sb.devices.map((d) => ({ ...d })); },
    loadFloor() {}, renderFloorTabs() {}, goStep() {}, serverSaveState() {}, newFloorId: () => "f_new",
    flushNow() { sb.pushServer(JSON.stringify({ floors: sb.floors })); },
    curStep: 1, bgHasImage: true,
  };
  sb.floors = floors || [{ id: "f1", name: "Floor 1", bg: "x", started: true, devices: sb.devices }];
  vm.createContext(sb);
  vm.runInContext([
    "function frozen(){ return RO || submitted || restoreFailed; }",
    "var delStash=[];",
    extractFn(widget, "removeDevice"), extractFn(widget, "undoDeleteDevice"), extractFn(widget, "stripDevs"),
    extractFn(widget, "deleteFloor"), extractFn(widget, "pushServer"),
  ].join("\n"), sb);
  return sb;
}
const cids = (sb) => sb.devices.map((d) => d.cid);

// ------------------------------------------------------------------ B ---------------------------------
test("deleting a MIDDLE device leaves every other cid exactly as it was", () => {
  const sb = world();
  const before = cids(sb);
  sb.removeDevice(2, "t1");
  assert.deepEqual(cids(sb), ["c1", "c3", "c4", "c5"], "c1,c3,c4,c5 — no renumber, no gap-fill, no new cid");
  // the survivors are the very same records, untouched
  assert.deepEqual(sb.devices.map((d) => d.tag), ["IC1", "IC3", "IC4", "IC5"]);
  assert.ok(before.includes("c2") && !cids(sb).includes("c2"));
});

test("Undo restores the SAME cid at the SAME position — it does not append a new one", () => {
  const sb = world();
  sb.removeDevice(2, "t1");
  assert.equal(sb.undoDeleteDevice("t1"), true);
  assert.deepEqual(cids(sb), ["c1", "c2", "c3", "c4", "c5"], "back in slot 2 with its own cid");
  assert.equal(sb.devices[1].tag, "IC2", "its original tag, so no duplicate IC5 from a recount");
  assert.equal(sb.mounted.length, 1, "and re-mounted on the plan");
});

test("Undo is per-token, single-use, and restores the first and last slots too", () => {
  const sb = world();
  sb.removeDevice(1, "a"); sb.removeDevice(5, "b");
  assert.deepEqual(cids(sb), ["c2", "c3", "c4"]);
  assert.equal(sb.undoDeleteDevice("nope"), false, "an unknown token does nothing");
  assert.equal(sb.undoDeleteDevice("b"), true);
  assert.equal(sb.undoDeleteDevice("b"), false, "a token can't be replayed (no duplicate device)");
  assert.equal(sb.undoDeleteDevice("a"), true);
  assert.deepEqual(cids(sb), ["c1", "c2", "c3", "c4", "c5"]);
});

test("Undo after a floor ROUND-TRIP restores the right device — runtime ids restart at 0 on every loadFloor", () => {
  const sb = world();
  sb.removeDevice(2, "t");                       // c2 had runtime id 2
  // leaving and re-entering the floor: loadFloor resets devSeq and re-adds the saved records, so the
  // runtime ids restart — id 2 now belongs to c3, a DIFFERENT device.
  sb.devSeq = 0; sb.devices = [];
  for (const c of ["c1", "c3", "c4", "c5"]) sb.reAdd({ k: "cam", cid: c, name: c });
  assert.equal(sb.devices[1].id, 2); assert.equal(sb.devices[1].cid, "c3", "the id now points at another device");
  assert.equal(sb.undoDeleteDevice("t"), true);
  assert.deepEqual(cids(sb), ["c1", "c2", "c3", "c4", "c5"], "c2 back in slot 2; nothing displaced, nothing duplicated");
  assert.equal(new Set(sb.devices.map((d) => d.id)).size, 5, "every runtime id unique");
});

test("Undo never duplicates a device that is already back (matched by cid, not runtime id)", () => {
  const sb = world();
  sb.removeDevice(2, "t");
  sb.reAdd({ k: "cam", cid: "c2" });             // somehow present again
  assert.equal(sb.undoDeleteDevice("t"), false);
  assert.equal(sb.devices.filter((d) => d.cid === "c2").length, 1);
});

test("deleting a floor drops the stash, and the widget echoes the newest token for the host toast", () => {
  const sb = world({ floors: [{ id: "f1", name: "Floor 1", devices: [] }, { id: "f2", name: "Floor 2", devices: [] }] });
  sb.removeDevice(2, "t");
  assert.equal(sb.delStash.length, 1);
  sb.deleteFloor(0);
  assert.equal(sb.delStash.length, 0, "the stash is gone with the floor — and reportDevices then echoes undo:null");
  const rd = extractFn(widget, "reportDevices");
  assert.match(rd, /undo:\(delStash\.length\?delStash\[delStash\.length-1\]\.token:null\)/);
});

test("the toast cannot outlive the stash: it is dropped when the echo changes, or the survey locks", () => {
  assert.match(roster, /undoToken === undefined\) return;/);
  assert.match(roster, /if \(undoToken === undo\.token\) \{ if \(!undo\.seen\)/);
  assert.match(roster, /else if \(undo\.seen\) \{ clearTimeout\(undoT\.current\); setUndo\(null\); \}/);
  assert.match(roster, /if \(locked \|\| readOnly\) \{ clearTimeout\(undoT\.current\); setUndo\(null\); return; \}/);
  for (const f of ["site-survey-widget.jsx", "system-planner.jsx"]) {
    const src = readFileSync(new URL("../app/project/[accessId]/" + f, import.meta.url), "utf8");
    assert.match(src, /setRosterUndo\((e\.data|m)\.undo \|\| null\)/, f + " mirrors the widget's echo");
    assert.match(src, /undoToken=\{rosterUndo\}/, f + " passes it to the roster");
  }
});

test("a delete with no token (map-side) stashes nothing", () => {
  const sb = world();
  sb.removeDevice(3);
  assert.equal(sb.delStash.length, 0);
});

test("Undo after the user moved to another floor puts the record back on ITS floor", () => {
  const sb = world({ floors: [{ id: "f1", name: "Floor 1", devices: [] }, { id: "f2", name: "Floor 2", devices: [] }] });
  const f1 = sb.floors[0];
  sb.removeDevice(2, "t");
  f1.devices = sb.devices.map((d) => ({ ...d }));   // snapFloor on leaving floor 1
  sb.curFloor = 1;
  assert.equal(sb.undoDeleteDevice("t"), true);
  assert.deepEqual(f1.devices.map((d) => d.cid), ["c1", "c2", "c3", "c4", "c5"]);
  assert.equal(sb.devices.length, 4, "the floor now on screen is untouched");
});

test("Undo is a no-op once the floor it came from is gone", () => {
  const sb = world({ floors: [{ id: "f1", name: "Floor 1", devices: [] }, { id: "f2", name: "Floor 2", devices: [] }] });
  sb.removeDevice(2, "t");
  sb.floors.splice(0, 1);
  assert.equal(sb.undoDeleteDevice("t"), false);
});

test("neither delete nor undo is reachable when the survey is frozen", () => {
  const sb = world();
  sb.removeDevice(2, "t");
  sb.submitted = true;
  assert.equal(sb.undoDeleteDevice("t"), false, "submitted → undo refused");
  assert.deepEqual(cids(sb), ["c1", "c3", "c4", "c5"]);
  // the verbs are gated at the message handler, before any device verb runs
  const h = widget.slice(widget.indexOf('m.type!=="iotSurveyCmd"'));
  assert.ok(h.indexOf("if(RO) return;") < h.indexOf('m.cmd==="deleteFloor"'), "read-only returns before the floor verbs");
  assert.ok(h.indexOf("if(RO) return;") < h.indexOf('m.cmd==="undoDelete"'), "…and before undo");
  assert.ok(h.indexOf("if(frozen()) return;") < h.indexOf('m.cmd==="delete"'), "frozen returns before delete");
});

test("the X is only rendered unlocked, is icon-only with a label, and replaces the menu item", () => {
  assert.match(roster, /\{!locked && \(\s*<button type="button" className="sd-x" title="Delete" aria-label=\{`Delete \$\{nm\}`\}/);
  assert.match(roster, /if \(readOnly \|\| locked \|\| id == null\) return;/, "deleteDevice refuses while locked/read-only");
  assert.match(roster, /if \(readOnly\) return null;/, "customers never get the roster");
  assert.ok(!/Delete device|Confirm delete/.test(roster), "the ••• → Delete device path is gone");
  assert.ok(!/[✕✖×]/.test(roster.slice(roster.indexOf("sd-x\""), roster.indexOf("sd-x\"") + 400)), "no glyph — inline SVG");
});

test("the toast offers Undo for exactly 5 seconds and the commands carry a token", () => {
  assert.equal(UNDO_MS, 5000);
  const d = deleteDeviceCmd(7), d2 = deleteDeviceCmd(7);
  assert.equal(d.cmd, "delete"); assert.equal(d.id, 7);
  assert.ok(d.token && d.token !== d2.token, "every delete gets its own token");
  assert.deepEqual(undoDeleteCmd(d.token), { cmd: "undoDelete", token: d.token });
  assert.match(roster, /setTimeout\(\(\) => setUndo\(null\), UNDO_MS\)/);
  assert.match(roster, /bottom:var\(--dock-stack/, "positioned from the dock tokens");
});

test("cids are never derived from position (the invariant the delete relies on)", () => {
  assert.match(extractFn(widget, "mkcid"), /Math\.random\(\)/);
  assert.ok(!/cid\s*[:=]\s*[^;,}]*(\.length|idx|index)/.test(extractFn(widget, "reAdd")));
});

// ------------------------------------------------------------------ C ---------------------------------
test("deleting the ONLY floor resets to a blank Floor 1 and declares clearIntent exactly once", () => {
  const sb = world();
  sb.deleteFloor(0);
  assert.equal(sb.floors.length, 1);
  assert.equal(sb.floors[0].name, "Floor 1");
  assert.deepEqual([sb.floors[0].bg, sb.floors[0].devices.length, sb.floors[0].started], [null, 0, false]);
  assert.equal(sb.curFloor, 0);
  assert.equal(sb.posts.length, 1, "flushed at once (not left to the 400ms debounce)");
  assert.equal(sb.posts[0].allowEmpty, true, "the empty write declares its intent");
  assert.equal(sb.clearIntent, false, "…and the declaration is consumed");
  sb.pushServer(JSON.stringify({ floors: sb.floors }));
  assert.equal(sb.posts[1].allowEmpty, false, "the next ordinary write does not");
});

test("an ordinary save/device delete never declares clearIntent", () => {
  const sb = world();
  sb.removeDevice(2, "t");
  sb.pushServer("{}");
  assert.equal(sb.posts[0].allowEmpty, false);
  assert.ok(!/clearIntent=true/.test(extractFn(widget, "save")) && !/clearIntent=true/.test(extractFn(widget, "removeDevice")) && !/clearIntent=true/.test(extractFn(widget, "undoDeleteDevice")));
});

test("deleting the only floor is refused while frozen, and declares nothing", () => {
  for (const flag of [{ submitted: true }, { RO: true }]) {
    const sb = world(flag);
    sb.deleteFloor(0);
    assert.equal(sb.clearIntent, false);
    assert.equal(sb.posts.length, 0);
    assert.equal(sb.floors[0].devices.length, 5, "the survey is untouched");
  }
});

test("the planner's Delete is no longer greyed out on the only floor; confirm first; locked still disables", () => {
  assert.ok(!/disabled=\{only\}/.test(planner), "the only-floor grey-out is gone");
  assert.match(planner, /role="menuitem" disabled=\{locked\} onClick=\{\(\) => setMenuMode\("confirm"\)\}/);
  assert.match(planner, /onDelete && onDelete\(\); close\(\)/, "the delete only fires from the confirm step");
  assert.match(planner, /\{only \? "Reset" : "Delete"\}/);
});

// --- round-2 review: three ways Undo could put the WRONG thing back -------------------------------
test("Undo keeps reAdd's tag when the original tag has since been handed to a live device", () => {
  const sb = world();
  sb.removeDevice(5, "t1");                                     // IC5 goes to the stash
  sb.devices.push({ id: 99, k: "cam", cid: "cNew", tag: "IC5", name: "Camera 5" });  // a recount re-issues IC5
  assert.equal(sb.undoDeleteDevice("t1"), true);
  const back = sb.devices.find((d) => d.cid === "c5");
  assert.ok(back, "the device came back");
  assert.notEqual(back.tag, "IC5", "restoring the old tag would show IC5 twice");
  const tags = sb.devices.map((d) => d.tag);
  assert.equal(new Set(tags).size, tags.length, "no duplicate tag anywhere");
});

test("Undo refuses rather than popping an unrelated device when reAdd declines the record", () => {
  const sb = world();
  sb.removeDevice(3, "t1");
  const after = sb.devices.map((d) => d.cid);
  sb.reAdd = () => {};                                          // unknown kind → reAdd returns without pushing
  assert.equal(sb.undoDeleteDevice("t1"), false, "undo must report failure, not success");
  assert.deepEqual(sb.devices.map((d) => d.cid), after, "no live device was popped, reordered or re-tagged");
});

test("Start Over clears the stash, so Undo cannot resurrect a device onto a blanked floor", () => {
  const sb = world();
  sb.removeDevice(2, "t1");
  Object.assign(sb, {
    floorHasWork: () => false,                                  // skip the confirm, go straight to go()
    resetFloorRecord(f) { f.bg = null; f.started = false; f.devices = []; sb.devices = []; },
    askConfirm() { throw new Error("should not confirm when there is nothing to lose"); },
  });
  vm.runInContext(extractFn(widget, "startOverFloor"), sb);
  sb.startOverFloor();
  assert.equal(sb.undoDeleteDevice("t1"), false, "the stash must be gone after Start Over");
  assert.deepEqual(sb.devices, [], "the floor stays blank");
});

// The point is that the key MOVED — not what it currently says. Pinning the live value made every later
// section that edits the widget fail this test and retype it, which is how a cache-buster quietly stops
// being bumped. So: it must still look like a dated key, and must not be any value already superseded.
const STALE_WIDGET_KEYS = ["20261116-sectionA3", "20261116-sectionBCD3"];
test("the widget cache-buster moved with the widget", () => {
  const w = readFileSync(new URL("../app/project/[accessId]/site-survey-widget.jsx", import.meta.url), "utf8");
  const m = w.match(/WIDGET_VERSION = "([^"]+)"/);
  assert.ok(m, "the widget still declares a WIDGET_VERSION");
  assert.match(m[1], /^\d{8}-/, "a dated cache key");
  for (const old of STALE_WIDGET_KEYS) assert.notEqual(m[1], old, `the cache key is still the superseded ${old}`);
});
