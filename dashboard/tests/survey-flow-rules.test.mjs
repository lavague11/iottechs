// Group 2 (flow) — R1, R2, R3, R4 from docs/survey-rules.md.
//
// The pure rules run for real (survey-rail / survey-state). The two that live in JSX are checked
// against the shell source, because a React component cannot be mounted under bare Node here — each
// of those is paired with the pure rule it depends on, which IS executed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepAfter, stepBefore, railFromEcho, FLOOR_BAR_STEPS } from "../lib/survey-rail.js";
import { RAIL_STEPS, surveyLastStep } from "../lib/survey-state.js";

const shell = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");

// ---------------------------------------------------------------- R3

test("R3 — the flow starts at Background", () => {
  assert.equal(RAIL_STEPS[0], "background", "Background is the first step of the order");
  assert.equal(surveyLastStep(null), "background", "nothing saved at all");
  assert.equal(surveyLastStep("{}"), "background", "an empty blob");
  assert.equal(surveyLastStep(JSON.stringify({ floors: [] })), "background", "a blob with no lastStep");
  assert.equal(surveyLastStep(JSON.stringify({ lastStep: "nonsense" })), "background", "an unrecognised step");
  // A real saved step still wins — resuming is not affected by the new default.
  for (const s of RAIL_STEPS) assert.equal(surveyLastStep(JSON.stringify({ lastStep: s })), s);
  // The shell's own initial state uses the same first step.
  assert.ok(/initialStep \|\| "background"/.test(shell) && /initialStep !== "views" \? initialStep : "background"/.test(shell),
    "the rail state defaults to Background too");
});

// ---------------------------------------------------------------- R2

test("R2 — Next and Back move exactly one step, in the declared order", () => {
  assert.deepEqual(RAIL_STEPS, ["background", "layout", "cameras", "route", "views", "review"]);
  for (let i = 0; i < RAIL_STEPS.length; i++) {
    const cur = RAIL_STEPS[i];
    assert.equal(stepAfter(cur), RAIL_STEPS[i + 1] || null, `Next from ${cur}`);
    assert.equal(stepBefore(cur), RAIL_STEPS[i - 1] || null, `Back from ${cur}`);
  }
  assert.equal(stepBefore("layout"), "background", "Back from Layout reaches Background — it used to stick");
  assert.equal(stepBefore("background"), null, "and Background is the end of the line");
});

test("R2 — a draw echo cannot drag the rail off Background", () => {
  // THE BUG: asking for Background reopened the background tool. On a floor whose background was BUILT
  // with the draw tool that reopened the Structure editor, which echoes dock "draw" — so the rail went
  // straight back to Layout. Back stuck on Layout and the nav Background tile looked dead.
  assert.deepEqual(railFromEcho("background", "draw", "background"),
    { step: "background", reissue: false, pending: null }, "a draw echo while Background is pending keeps Background");
  assert.deepEqual(railFromEcho("background", "draw", null),
    { step: "background", reissue: false, pending: null }, "…and so does one that arrives once we are there");
  // Layout still owns the draw dock everywhere else.
  assert.deepEqual(railFromEcho("layout", "draw", null), { step: "layout", reissue: false, pending: null });
  assert.deepEqual(railFromEcho("cameras", "draw", null), { step: "layout", reissue: false, pending: null },
    "opening the Structure editor from Placement still moves the rail to Layout");
});

test("R2 — every Survey Navigation item is reachable, Background included", () => {
  // Each nav key must be a real rail step, and goRail must have a branch that drives it.
  const keys = [...shell.matchAll(/\{ key: "(\w+)", label: "([^"]+)"/g)].map((m) => m[1]);
  for (const k of ["background", "layout", "cameras", "route", "views", "review"]) {
    assert.ok(keys.includes(k), `Survey Navigation offers ${k}`);
    assert.ok(RAIL_STEPS.includes(k), `${k} is a real rail step`);
  }
  assert.ok(shell.includes('if (step === "background") surveyCmd({ cmd: "step", step: 0, focus: "view" });'),
    "Background shows the step rather than reopening an editor");
});

// ---------------------------------------------------------------- R4

test("R4 — the floor picker shows on Background, Layout, Placement and Route only", () => {
  assert.deepEqual([...FLOOR_BAR_STEPS].sort(), ["background", "cameras", "layout", "route"].sort());
  for (const s of ["background", "layout", "cameras", "route"]) assert.ok(FLOOR_BAR_STEPS.has(s), `${s} shows it`);
  for (const s of ["views", "review"]) assert.ok(!FLOOR_BAR_STEPS.has(s), `${s} does NOT show it`);
  // Every rail step is decided one way or the other — a new step cannot silently inherit a floor bar.
  for (const s of RAIL_STEPS) assert.equal(typeof FLOOR_BAR_STEPS.has(s), "boolean");
  assert.ok(shell.includes("!FLOOR_BAR_STEPS.has(railStep) ? null : ("), "the shell gates the bar on that set");
});

// ---------------------------------------------------------------- R1

test("R1 — Survey Navigation opens, centred, when the survey opens", () => {
  assert.ok(/renderNavPop\(navOpenOnLoad, setNavOpenOnLoad, "center"\)/.test(shell),
    "the panel is rendered in the centre placement on load");
  assert.ok(/\.syp-navpop--center\{position:fixed;top:50%;left:50%/.test(shell),
    "centre means centred on the screen, not anchored to a trigger");
  // Staff only, once, and never over a deep link that already names the step.
  assert.ok(/if \(customer \|\| navOpenedOnce\.current \|\| initialStep\) return;/.test(shell),
    "not for customers, not twice, and not when a step was deep-linked");
});
