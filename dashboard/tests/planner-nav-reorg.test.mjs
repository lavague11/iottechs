// System Planner staff nav reorg (Phase 1): floor selector on top, rail below the canvas,
// legacy Background|Setup strip gone, Plan→Floor Plan, Floor-Plan ✓ tracks submission.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const wrap = readFileSync(new URL("../app/project/[accessId]/site-survey-widget.jsx", import.meta.url), "utf8");
const gw = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");

test("Plan is renamed to Floor Plan, and its ✓ tracks built geometry OR submission", () => {
  assert.ok(sp.includes('label: "Floor Plan"'), "rail label is 'Floor Plan'");
  assert.ok(!/label: "Plan"/.test(sp), "no stale 'Plan' label");
  assert.ok(sp.includes("done: sig.hasPlan || surveySubmitted"), "Floor Plan done = geometry OR submitted");
  assert.ok(/surveySubmitted = false/.test(sp), "surveySubmitted prop on SystemPlanner");
  assert.ok(gw.includes("surveySubmitted={!!acceptances.submit_site_survey}"), "gateway passes submission state");
});

test("staff: floor carousel header on top, contextual nav footer below the canvas", () => {
  assert.ok(sp.includes('className="syp-floorbar"'), "full-width floor carousel header");
  assert.ok(sp.includes("<FloorSelect floors={roster}"), "the header's floor name opens FloorSelect");
  assert.ok(sp.includes('className="syp-nav"'), "a contextual nav footer exists");
  // the nav footer (below) must come AFTER the plan pane in source order (i.e. below the canvas)
  const panePos = sp.indexOf('className="syp-pane syp-plan"');
  const navPos = sp.indexOf('className="syp-nav"');
  const floorbarPos = sp.indexOf('className="syp-floorbar"');
  assert.ok(floorbarPos > 0 && floorbarPos < panePos, "floor header is above the canvas");
  assert.ok(panePos > 0 && navPos > panePos, "nav footer is rendered after (below) the canvas pane");
  // the always-on 5-tab rail is gone (replaced by the guided footer + ••• Go-to)
  assert.ok(!sp.includes('role="tablist"'), "the 5-tab rail tablist is removed");
});

test("contextual nav footer: Back/Next progression + a state-derived Review CTA (canonical submit/continue)", () => {
  // guided navigation reuses goRail; Views drops out of the Next flow when optional+untouched
  assert.ok(sp.includes('const navOrder = ["background", "plan", "cameras", ...(viewsInFlow ? ["views"] : []), "review"];'), "Next skips optional Views");
  assert.ok(sp.includes("const nextStep = navOrder[navIdx + 1] || null;") && sp.includes("const prevStep = navOrder[navIdx - 1] || null;"), "prev/next derived from the canonical order");
  assert.ok(sp.includes("Submit Site Survey") && sp.includes("Re-submit Site Survey") && sp.includes("Continue to Proposal"), "Review CTA = Submit / Re-submit / Continue");
  assert.ok(sp.includes('onSubmitTool && onSubmitTool("site_survey")'), "CTA drives the canonical submit (onSubmitTool)");
  assert.ok(sp.includes("onContinue && onContinue()"), "approved → Continue reuses onContinue");
  // gateway passes the canonical wiring
  assert.ok(gw.includes("surveyOk={surveyOk}") && gw.includes("onSubmitTool=") && gw.includes("onContinue={() => browse(\"proposal\")}"), "gateway wires surveyOk/onSubmitTool/onContinue");
  // the detailed submit bars live in the Review pane now (not always-below); customer keeps the standalone approve surface
  assert.ok(/syp-review[\s\S]{0,600}\{footer\}/.test(sp), "submit bars (footer) moved into the Review pane");
  assert.ok(sp.includes("{customer && footer}"), "customer approve surface stays standalone");
});

test("FloorSelect exposes full parity: switch/add/rename/duplicate/delete", () => {
  const f = sp.slice(sp.indexOf("function FloorSelect("));
  for (const bit of ["onSwitch", "onAdd", "onRename", "onDuplicate", "onDelete", "+ Add floor", "Rename", "Duplicate", "Delete"]) {
    assert.ok(f.includes(bit), `FloorSelect has ${bit}`);
  }
  assert.ok(f.includes("disabled={only}"), "Delete disabled when only one floor");
  assert.ok(f.includes('menuMode === "confirm"'), "delete has an inline confirm step");
});

test("widget: planner mode hides the Background|Setup strip and adds floor commands", () => {
  assert.ok(widget.includes('get("planner")==="1"'), "parses ?planner=1");
  assert.ok(widget.includes("body.planner #surveyWiz{display:none!important}"), "hides #surveyWiz (important beats exitBg)");
  assert.ok(wrap.includes('noRoster ? "&planner=1" : ""'), "wrapper sends planner=1 when embedded in the planner");
  // the four floor commands must sit AFTER the RO edit guard, and the nav-only floor cmd stays before it
  const roGuard = widget.indexOf("if(RO) return;", widget.indexOf('m.type!=="iotSurveyCmd"'));
  for (const c of ['if(m.cmd==="addFloor")', 'if(m.cmd==="duplicateFloor")', 'if(m.cmd==="deleteFloor")', 'if(m.cmd==="renameFloor")']) {
    const at = widget.indexOf(c);
    assert.ok(at > roGuard, `${c} is a staff edit (after the RO guard)`);
  }
  assert.ok(widget.indexOf('if(m.cmd==="floor")') < roGuard, "floor switch stays nav-only (before RO guard)");
});
