// Consulting reorg — message-string DRIFT GUARD (P0 safety net).
// The System Planner shell relays postMessages between the Site Survey, Satellite, Draw and CCTV
// Mockup iframes. A silent rename of any cross-iframe message `type` (or an `iotSurveyCmd` `cmd`)
// breaks the relay with no compile error — the widgets are static HTML. This test freezes the set
// of message identifiers so a rename fails loudly and a NEW identifier must be added here on purpose
// (each reorg phase that adds one — iotSurveyStep, iotMockupPhoto — updates the frozen set below).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const FILES = [
  "public/widgets/site-survey-merged.html",
  "public/widgets/satellite-capture.html",
  "public/widgets/cctv-mockup.html",
  "public/widgets/draw-floorplan.html",
  "app/project/[accessId]/system-planner.jsx",
  "app/project/[accessId]/site-survey-widget.jsx",
  "app/project/[accessId]/mockup-widget.jsx",
];
const corpus = FILES.map(read).join("\n");

// The complete set of `iot*` postMessage types across the shell + all four widgets. Frozen on purpose.
const EXPECTED_TYPES = new Set([
  "iotAerialRestore", "iotBgReady", "iotCaptureCancel", "iotDrawBackdrop", "iotDrawFloor",
  "iotFloors", "iotLoadCapture", "iotMockup", "iotMockupCmd", "iotMockupComment",
  "iotMockupFullscreen", "iotMockupRenamed", "iotMockupSelect", "iotOutlineLoad", "iotOutlineReady",
  "iotOutlineSave", "iotPlanLoad", "iotPlanReady", "iotPlanSave", "iotSurvey",
  "iotSurvey2Submit", "iotSurvey2Unsubmit", "iotSurveyCmd", "iotSurveyComment", "iotSurveyContext",
  "iotSurveyDevices", "iotSurveyFocus", "iotSurveyFocusState", "iotSurveyReqFocus", "iotSurveySelect",
  "iotSurveySubmitState", "iotSurveyZoom", "iotZonePolys", "iotZonesMigrated",
]);

test("no cross-iframe message type is renamed or added without updating the drift guard", () => {
  const found = new Set((corpus.match(/"iot[A-Za-z0-9]+"/g) || []).map((s) => s.slice(1, -1)));
  const added = [...found].filter((t) => !EXPECTED_TYPES.has(t));
  const removed = [...EXPECTED_TYPES].filter((t) => !found.has(t));
  assert.deepEqual(added, [], `NEW message type(s) not in the frozen set — add them here on purpose: ${added.join(", ")}`);
  assert.deepEqual(removed, [], `message type(s) vanished (rename/removal breaks the relay): ${removed.join(", ")}`);
});

// The iotSurveyCmd verbs the survey widget handles (host → survey iframe). The rail (P4) adds "step";
// the photo-sync path (P6) routes "photo" by cid. Frozen so a handler rename is caught.
const EXPECTED_SURVEY_CMDS = new Set([
  "floor", "select", "selectCid", "hover", "renameCid", "rename", "fov", "delete", "photo", "clearPhoto",
]);
test("iotSurveyCmd verbs handled by the survey widget stay stable", () => {
  const survey = read("public/widgets/site-survey-merged.html");
  const found = new Set((survey.match(/m\.cmd==="[a-zA-Z]+"/g) || []).map((s) => s.replace(/m\.cmd==="|"/g, "")));
  for (const c of EXPECTED_SURVEY_CMDS) assert.ok(found.has(c), `survey iotSurveyCmd verb "${c}" is gone (relay break)`);
});
