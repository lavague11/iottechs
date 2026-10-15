// Consulting reorg — canonical device/photo sync (P6).
// A photo attached in the mockup used to write the survey2 blob server-side but never notified the live
// survey iframe, so the shared Devices roster showed "No photo" (and the mockup grid went stale) until a
// full reload. One canonical path now closes it: mockup → shell (iotMockupPhoto, by cid) → survey iframe
// (iotSurveyCmd photo, by cid) → reportDevices → iotSurveyDevices → roster + liveCameras; the photo bit in
// liveKey re-feeds the mockup grid. These source-reads lock each hop.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("mockup posts iotMockupPhoto (by cid) up after its /api/project-cameras write", () => {
  const mockup = read("public/widgets/cctv-mockup.html");
  const push = mockup.slice(mockup.indexOf("function pushPhotoToSurvey("), mockup.indexOf("function pushPhotoToSurvey(") + 1400);
  assert.ok(push.includes("'/api/project-cameras'"), "still writes the canonical server blob (setSurveyCameraPhoto by floor,di)");
  assert.ok(push.includes("type:'iotMockupPhoto', cid:(c.id||c.cid||null), photo:url||null"), "then notifies the shell, keyed by the stable cid");
});

test("shell relays iotMockupPhoto → the survey iframe as iotSurveyCmd photo (by cid)", () => {
  const shell = read("app/project/[accessId]/system-planner.jsx");
  assert.ok(shell.includes('else if (m.type === "iotMockupPhoto" && m.cid)'), "shell handles the mockup photo notification");
  assert.ok(shell.includes('post("Site Survey", { type: "iotSurveyCmd", cmd: "photo", project: accessId, cid: m.cid, photo: m.photo || null, photoName: m.photoName || null })'), "relays to the survey iframe by cid");
  // the photo bit in liveKey re-feeds the mockup grid when a photo changes anywhere
  assert.ok(shell.includes("`${c.id}:${c.name}:${c.photo ? 1 : 0}`"), "liveKey includes the photo bit");
});

test("survey updates the device photo by cid (even when frozen — a photo is not fingerprinted)", () => {
  const survey = read("public/widgets/site-survey-merged.html");
  assert.ok(survey.includes('if(m.cmd==="photo" && m.cid){ var ph=m.photo||null, curHit=null;'), "resolves the relayed photo by cid");
  assert.ok(survey.includes("for(var pf=0;pf<floors.length;pf++)"), "searches ALL floors (the photographed camera may not be the current floor)");
  // it sits BEFORE the frozen gate (if(!d) return) so a submitted survey still reflects Views photos
  const idx = survey.indexOf('if(m.cmd==="photo" && m.cid)');
  const frozenGate = survey.indexOf("if(!d) return;", survey.indexOf('m.cmd==="renameCid"'));
  assert.ok(idx > 0 && idx < frozenGate, "the cid-photo case runs before the by-id frozen gate");
  // renderPanel → reportDevicesSoon re-emits iotSurveyDevices → the shared roster + liveCameras refresh
  assert.ok(survey.includes("renderPanel(); queueSave(); return; }   // renderPanel"), "re-renders + persists, triggering the roster re-emit");
});
