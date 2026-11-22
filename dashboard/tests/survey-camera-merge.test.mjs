// mergeSurveyCameraPatch: reconcile an open survey editor's draft with a camera patch that
// /api/project-cameras wrote straight into survey2 (setSurveyCameraPhoto / setSurveyCameraName).
// Without it, that outside write moves the row's revision, the editor's next autosave is refused as
// stale (B14), and the autosync retries identical bytes every 5s forever — the survey silently stops
// saving until the page is reloaded. The merge must keep BOTH sides: the photo AND the user's edits.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeSurveyCameraPatch } from "../lib/tool-data.js";

const base = (devices, extra = {}) => JSON.stringify({
  floors: [{ id: "f1", name: "Floor 1", bg: "/api/media/aaa", started: true, devices, ...extra }],
});
const cam = (over = {}) => ({ k: "cam", x: 10, y: 20, name: "Camera 1", ...over });

test("a camera photo written elsewhere folds into the local draft, keeping the local edit", () => {
  const ancestor = base([cam(), cam({ name: "Camera 2", x: 50 })]);
  // the server gained a photo on camera 1 (what /api/project-cameras does)
  const server = base([cam({ photo: "/api/media/p1", photoName: "front" }), cam({ name: "Camera 2", x: 50 })]);
  // meanwhile the editor moved camera 2 — an unsaved local edit
  const local = base([cam(), cam({ name: "Camera 2", x: 77 })]);
  const r = mergeSurveyCameraPatch(ancestor, server, local);
  assert.equal(r.ok, true);
  assert.equal(r.patches, 1);
  const out = JSON.parse(r.merged).floors[0].devices;
  assert.equal(out[0].photo, "/api/media/p1", "the photo written elsewhere survives");
  assert.equal(out[0].photoName, "front");
  assert.equal(out[1].x, 77, "the local edit is NOT lost");
});

test("a rename written elsewhere folds in the same way", () => {
  const ancestor = base([cam()]);
  const server = base([cam({ name: "Front Door" })]);
  const local = base([cam()]);
  const r = mergeSurveyCameraPatch(ancestor, server, local);
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(r.merged).floors[0].devices[0].name, "Front Door");
});

test("anything beyond photo/photoName/name is a real conflict and is REFUSED", () => {
  const ancestor = base([cam()]);
  // a moved device is not something /api/project-cameras can do → do not guess
  assert.equal(mergeSurveyCameraPatch(ancestor, base([cam({ x: 99 })]), base([cam()])).ok, false, "moved device");
  // a device added or removed server-side
  assert.equal(mergeSurveyCameraPatch(ancestor, base([cam(), cam()]), base([cam()])).ok, false, "device added");
  assert.equal(mergeSurveyCameraPatch(ancestor, base([]), base([cam()])).ok, false, "device removed");
  // the background swapped
  assert.equal(mergeSurveyCameraPatch(ancestor, base([cam()], { bg: "/api/media/bbb" }), base([cam()])).ok, false, "bg changed");
  // a different kind of device now sits at that index
  assert.equal(mergeSurveyCameraPatch(ancestor, base([cam({ k: "nvr" })]), base([cam()])).ok, false, "kind changed");
  // a floor appeared
  const twoFloors = JSON.stringify({ floors: [...JSON.parse(ancestor).floors, { id: "f2", devices: [] }] });
  assert.equal(mergeSurveyCameraPatch(ancestor, twoFloors, ancestor).ok, false, "floor added");
});

test("a patch whose camera has moved locally is dropped, never forced onto the wrong one", () => {
  const ancestor = base([cam(), cam({ name: "Camera 2" })]);
  const server = base([cam({ photo: "/api/media/p1" }), cam({ name: "Camera 2" })]);
  // locally the user deleted camera 1, so index 0 is now a different device
  const local = base([cam({ k: "nvr", name: "NVR" })]);
  const r = mergeSurveyCameraPatch(ancestor, server, local);
  assert.equal(r.ok, true);
  assert.equal(r.patches, 0, "nothing applied");
  assert.equal(JSON.parse(r.merged).floors[0].devices[0].k, "nvr", "the local device is untouched");
});

test("unreadable or absent input never merges", () => {
  assert.equal(mergeSurveyCameraPatch(null, base([cam()]), base([cam()])).ok, false);
  assert.equal(mergeSurveyCameraPatch(base([cam()]), "{broken", base([cam()])).ok, false);
  assert.equal(mergeSurveyCameraPatch(base([cam()]), base([cam()]), "{broken").ok, false);
  assert.equal(mergeSurveyCameraPatch("{}", "{}", "{}").ok, false, "no floors array");
});
