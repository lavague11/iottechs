// Consulting reorg — the unified workflow RAIL (P4) wiring guard.
// The System Planner shell replaced the Plans|Views toggle with one rail: Background · Plan · Cameras ·
// Views · Review. Background/Plan/Cameras drive the SAME survey iframe's internal step via postMessage
// (no second step state, no remount); Views/Review are shell-only. These source-reads lock that wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

test("the rail replaces the Plans|Views toggle (single Consulting navigation)", () => {
  assert.ok(!shell.includes('className="syp-seg"'), "the old Plans|Views segmented toggle is gone");
  assert.ok(!/>Plans<\/button>/.test(shell) && !/setMode\(/.test(shell), "no Plans/Views tab buttons or mode toggle remain");
  assert.ok(shell.includes('className="syp-rail"'), "the rail exists");
  for (const label of ["Background", "Floor Plan", "Cameras", "Views", "Review"]) assert.ok(shell.includes(`label: "${label}"`), `rail has the ${label} step`);
});

test("rail drives the survey's internal step via postMessage (Background→0, Plan→1, Cameras→1+devices); Views/Review shell-only", () => {
  assert.ok(shell.includes('if (step === "background") surveyCmd({ cmd: "step", step: 0 });'), "Background → survey step 0");
  assert.ok(shell.includes('else if (step === "plan") surveyCmd({ cmd: "step", step: 1 });'), "Plan → survey step 1");
  assert.ok(shell.includes('else if (step === "cameras") surveyCmd({ cmd: "step", step: 1, focus: "devices" });'), "Cameras → survey step 1 + device focus");
  // paneMode keeps both iframes mounted (visibility only); Views flips to the mockup pane
  assert.ok(shell.includes('const paneMode = railStep === "views" ? "views" : railStep === "review" ? "review" : "plan";'), "paneMode derived from railStep");
  assert.ok(shell.includes('hidden={paneMode !== "plan"}') && shell.includes('hidden={paneMode !== "views"}'), "panes toggle visibility (never unmount)");
});

test("the shell follows the survey's step echo (iotSurveyStep) for the live indicator + Done→Plan auto-advance", () => {
  assert.ok(shell.includes('else if (m.type === "iotSurveyStep")'), "shell handles the survey step echo");
  assert.ok(shell.includes('setRailStep((cur) => (m.step === 0 ? "background" : cur === "background" ? "plan" : cur));'), "follows Background↔Setup; keeps an explicit Plan/Cameras/Review within Setup");
  assert.ok(shell.includes("setSig({ bgReady: !!m.bgReady, hasPlan: !!m.hasPlan, camCount: +m.camCount || 0 });"), "completion signals come from the echo");
});

test("the survey widget emits iotSurveyStep from goStep and handles the step command", () => {
  assert.ok(survey.includes("emitSurveyStep();    // tell the host rail"), "goStep emits the step echo");
  assert.ok(survey.includes('parent.postMessage({ type:"iotSurveyStep", project:PID, step:curStep,'), "the echo carries step + signals");
  assert.ok(/if\(m\.cmd==="step"\)\{ if\(typeof m\.step==="number"\) goStep\(m\.step\);/.test(survey), "the survey handles iotSurveyCmd {cmd:'step'} by reusing goStep");
  assert.ok(survey.includes('if(m.focus==="devices"){ sideCollapsed=false; applySideCollapsed(); }'), "the Cameras focus opens the device panel");
});
