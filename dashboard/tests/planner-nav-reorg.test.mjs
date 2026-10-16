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

test("staff: floor selector on top, rail relocated below the canvas", () => {
  assert.ok(sp.includes("syp-head--staff"), "staff top head");
  assert.ok(sp.includes("<FloorSelect floors={roster}"), "top selector is the FloorSelect");
  assert.ok(sp.includes('className="syp-railbar"'), "a dedicated rail bar exists");
  // the rail bar (below) must come AFTER the plan pane in source order (i.e. below the canvas)
  const panePos = sp.indexOf('className="syp-pane syp-plan"');
  const railbarPos = sp.indexOf('className="syp-railbar"');
  assert.ok(panePos > 0 && railbarPos > panePos, "rail bar is rendered after (below) the canvas pane");
  // and the staff top head must NOT contain the tablist rail anymore
  const staffHead = sp.slice(sp.indexOf("syp-head--staff"), sp.indexOf("syp-head--staff") + 400);
  assert.ok(!staffHead.includes('role="tablist"'), "the rail is no longer in the top head");
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
