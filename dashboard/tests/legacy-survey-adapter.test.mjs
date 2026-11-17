// B11 — a legacy "survey" blob renders in the new viewer, read-only.
// The old tool stored floors[].B.img + floors[].markers; nothing mapped it onto survey2, so a
// legacy-only project showed "Draw the structure first" / "No cameras yet" in the portal while the
// office surveys list showed its data. These tests pin the conversion AND the fact that it can never
// be written back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legacySurveyToSurvey2, isLegacySurvey, parseSurveyFloors, surveyDevices, renderableFloors } from "../lib/survey2-model.js";
import { toolPayloadSendable } from "../app/project/[accessId]/tool-sync.js";

// Shaped exactly like the real rows (verified against all 38 legacy surveys in the database).
const legacy = {
  curFloor: 0, theme: "light", pinScale: 1, surveyTitle: "Survey",
  floors: [{
    name: "Floor Plan 1", uid: 23,
    B: { bg: "image", img: "data:image/jpeg;base64,AAAA", imgSource: "upload", imgRatio: 1.4117647, imgRotate: 0,
         ftWide: 0, rooms: [], strokes: [], notes: [], sat: null, zoom: { s: 0.873, tx: 75, ty: 34.7 } },
    markers: [
      { id: 22, mode: "in", kind: "cam", x: 44.36, y: 50.21, _tag: "IC1", arrow: { angle: 10.5, len: 35.84 } },
      { id: 23, mode: "outdoor", kind: "camera", x: 10, y: 90, _tag: "OC1" },
    ],
  }],
};
const survey2 = { floors: [{ name: "Floor 1", bg: "data:image/png;base64,BBBB", started: true, devices: [{ k: "cam", x: 1, y: 2 }] }] };

test("a legacy blob is recognised, a survey2 blob is not", () => {
  assert.equal(isLegacySurvey(legacy), true);
  assert.equal(isLegacySurvey(survey2), false);
  assert.equal(isLegacySurvey({ floors: [] }), false);
  assert.equal(isLegacySurvey(null), false);
  assert.equal(legacySurveyToSurvey2(survey2), null, "a current blob is left entirely alone");
  assert.equal(legacySurveyToSurvey2("not json"), null);
});

test("coordinates carry over UNCHANGED — board-percent is image-percent in the old widget", () => {
  const out = legacySurveyToSurvey2(legacy);
  const [a, b] = out.floors[0].devices;
  assert.equal(a.x, 44.36); assert.equal(a.y, 50.21);
  assert.equal(b.x, 10); assert.equal(b.y, 90);
  // the facts that make the straight carry-over correct, pinned against the old widget's source
  const w = readFileSync(new URL("../public/widgets/site-survey.html", import.meta.url), "utf8");
  assert.match(w, /p\.style\.left=m\.x\+'%';p\.style\.top=m\.y\+'%'/, "markers were positioned as a % of the board");
  assert.match(w, /\.board-img\{position:absolute;inset:0;width:100%;height:100%/, "and the image filled the board exactly");
  assert.match(w, /board\.style\.width=Math\.round\(w\)\+'px';board\.style\.height=Math\.round\(h\)\+'px'/, "the board was sized to the image's own ratio");
});

test("kinds, modes, aim and tags come across; nothing is invented", () => {
  const [a, b] = legacySurveyToSurvey2(legacy).floors[0].devices;
  assert.equal(a.k, "cam"); assert.equal(b.k, "cam", "the long name 'camera' normalises");
  assert.equal(a.mode, "in"); assert.equal(b.mode, "out", "'outdoor' normalises");
  assert.equal(a.aim, 10.5); assert.equal(a.aimed, true); assert.equal(a.cone, true);
  assert.equal(b.aim, 0); assert.equal(b.aimed, false, "no arrow → not aimed, not a fabricated 0-degree aim");
  assert.equal(a.tag, "IC1"); assert.equal(b.tag, "OC1");
  // ftWide is 0 on every legacy floor, so there is no scale to convert arrow.len into feet
  assert.equal(legacySurveyToSurvey2(legacy).floors[0].scale, null, "no scale is manufactured");
  assert.equal(a.range, 40, "the kind's own default reach, not a number derived from arrow.len");
  // ids are deterministic, so re-reading the same row never churns them
  assert.deepEqual(legacySurveyToSurvey2(legacy).floors[0].devices.map((d) => d.id), ["lg0_22", "lg0_23"]);
});

test("the background becomes the floor's bg, and a floor without one is dropped", () => {
  const out = legacySurveyToSurvey2(legacy);
  assert.equal(out.floors[0].bg, "data:image/jpeg;base64,AAAA");
  assert.equal(out.floors[0].bgSource, "upload");
  assert.equal(out.floors[0].started, true);
  assert.equal(out.floors[0].name, "Floor Plan 1");
  const blank = { floors: [{ name: "Empty", B: { bg: "blank", img: null }, markers: [] }] };
  assert.equal(legacySurveyToSurvey2(blank), null, "nothing to render → nothing claimed");
});

test("every renderer sees it, because parseSurveyFloors adapts on the way in", () => {
  const floors = parseSurveyFloors(JSON.stringify(legacy));
  assert.equal(floors.length, 1);
  assert.equal(floors[0].devices.length, 2);
  const devs = surveyDevices(floors);
  assert.equal(devs.length, 2, "the canonical device list sees legacy cameras");
  assert.equal(devs.filter((d) => d.k === "cam").length, 2);
  // and the current shape still parses identically
  assert.equal(parseSurveyFloors(JSON.stringify(survey2)).length, 1);
});

test("an adapted blob can NEVER be written back — reading a legacy project cannot convert it", () => {
  const adapted = JSON.stringify(legacySurveyToSurvey2(legacy));
  assert.match(adapted, /"__legacyAdapted":true/, "the blob is marked");
  assert.equal(toolPayloadSendable("survey2", adapted), false, "the outbound gate refuses it");
  // a genuine survey2 blob is still sendable, so the gate is specific
  assert.equal(toolPayloadSendable("survey2", JSON.stringify(survey2)), true);
});

test("the server RENDER path falls back to the legacy row", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.match(db, /export function getSurveyBlobForRender/, "one server-side resolver");
  assert.match(db, /getProjectDevices[\s\S]{0,200}getSurveyBlobForRender/, "the device list uses it");
  assert.match(db, /getProjectCameras[\s\S]{0,120}getSurveyBlobForRender/, "the camera roster uses it");
});

// The widget's SEED endpoint must not serve the adapted blob. Seeding there is not read-only in
// practice: the widget uploads a data-URL background to /api/media, rewrites `bg`, re-serialises its
// own state — which drops the `__legacyAdapted` marker the outbound gate keys on — and autosyncs the
// result. Opening the clone once wrote an 820-byte survey2 row, i.e. the migration write the owner
// asked not to make. Pinned so it is not "helpfully" added back without solving that first.
test("the widget's sync endpoint does NOT serve the adapted blob", () => {
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(route, /legacySurveyToSurvey2/, "no adapter in the seed/autosync route");
  assert.match(route, /saved: getToolData\(accessId, tool\)/, "it serves the stored row, unmodified");
  assert.match(route, /B11/, "and says why");
});

// Found by the verifier: 125 of the 128 legacy markers in this database sit on floors that never got
// a background. Filtering those floors out of the ADAPTER threw away nearly every legacy camera for a
// rendering reason that does not apply to a roster — a list needs no image.
test("a floor with devices but no background is kept for the roster, and dropped for drawing", () => {
  const markersOnly = { floors: [{ name: "Shop", B: { bg: "blank", img: null },
    markers: [{ id: 7, kind: "cam", x: 30, y: 40, _tag: "IC2" }] }] };
  const out = legacySurveyToSurvey2(markersOnly);
  assert.equal(out.floors.length, 1, "the adapter keeps it");
  assert.equal(out.floors[0].devices[0].tag, "IC2");
  assert.equal(out.floors[0].bg, "", "with no background");
  assert.equal(out.floors[0].started, false);
  // rendering still drops it, exactly as it drops a backgroundless survey2 floor
  assert.deepEqual(parseSurveyFloors(JSON.stringify(markersOnly)), []);
  assert.deepEqual(renderableFloors(out), []);
  // and a floor with neither is still nothing
  assert.equal(legacySurveyToSurvey2({ floors: [{ name: "x", B: { bg: "blank", img: null }, markers: [] }] }), null);
});

test("renderableFloors is what the migration materialises, not every adapted floor", () => {
  const mixed = { floors: [
    { name: "Plan", B: { bg: "image", img: "data:image/png;base64,AAA" }, markers: [{ id: 1, kind: "cam", x: 1, y: 2 }] },
    { name: "No plan", B: { bg: "blank", img: null }, markers: [{ id: 2, kind: "cam", x: 3, y: 4 }] },
  ] };
  const out = legacySurveyToSurvey2(mixed);
  assert.equal(out.floors.length, 2, "both reach the roster");
  assert.deepEqual(renderableFloors(out).map((f) => f.name), ["Plan"], "only one can be drawn");
});

// B7 + B15 — the two write-path consequences of the adapter and of stale clients.
test("B7: both tool-data write paths refuse a project that does not exist", () => {
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  for (const [src, who] of [[route, "POST /api/tool-data"], [action, "saveToolDataAction"]]) {
    assert.match(src, /if \(!getJobByAccessId\(accessId\)\) return [\s\S]{0,80}no longer exists/, `${who} resolves the project first`);
  }
  // and it has to come AFTER the role gate, so an unauthorised caller learns nothing about which ids exist
  const posIdx = route.indexOf("Read-only for your role."), chkIdx = route.indexOf("!getJobByAccessId(accessId)");
  assert.ok(posIdx > 0 && chkIdx > posIdx, "the existence check must not become an id oracle");
});

test("B15: a legacy-only survey says it is read-only, rather than blaming a concurrent edit", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.match(db, /export function surveyIsLegacyOnly/, "a predicate for the legacy-only case");
  // it must be false once a project has a real survey2, else every rename would claim to be legacy
  assert.match(db, /if \(toolHasData\("survey2"[\s\S]{0,60}return false;/, "a migrated project is not legacy-only");
  const route = readFileSync(new URL("../app/api/project-cameras/route.js", import.meta.url), "utf8");
  assert.match(route, /function notFoundReason\(accessId\)/, "one place decides the message");
  assert.match(route, /older format and is read-only until it is migrated/, "the legacy reason");
  assert.match(route, /the survey changed\. Reopen and retry\./, "the ordinary reason survives");
  assert.equal((route.match(/notFoundReason\(accessId\)/g) || []).length, 3, "both writers use it (plus the definition)");
});
