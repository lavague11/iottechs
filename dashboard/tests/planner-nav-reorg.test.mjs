// System Planner staff nav reorg (Phase 1): floor selector on top, rail below the canvas,
// legacy Background|Setup strip gone, Plan→Floor Plan, Floor-Plan ✓ tracks submission.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const wrap = readFileSync(new URL("../app/project/[accessId]/site-survey-widget.jsx", import.meta.url), "utf8");
const gw = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");

test("rebuild: 4-step rail Base · Layout · Cameras · Submit; steps track geometry/cameras/submission", () => {
  assert.ok(sp.includes('label: "Background"') && sp.includes('label: "Layout"') && sp.includes('label: "Placement"') && sp.includes('label: "Approval"'), "4-step rail labels (Background · Layout · Placement · Approval)");
  assert.ok(!/label: "Views"/.test(sp) && !/label: "Plan"/.test(sp), "no 'Views'/'Plan' rail step (Plan split into Layout + Cameras)");
  assert.ok(sp.includes('done: sig.hasPlan || surveySubmitted') && sp.includes('done: camsPlaced > 0 || surveySubmitted'), "Layout done = geometry/submitted; Cameras done = cameras/submitted");
  assert.ok(/surveySubmitted = false/.test(sp), "surveySubmitted prop on SystemPlanner");
  assert.ok(gw.includes("surveySubmitted={!!acceptances.submit_site_survey}"), "gateway passes submission state");
});

test("staff: floor carousel header on top, contextual nav footer below the canvas", () => {
  assert.ok(sp.includes('className="syp-floorbar"'), "full-width floor carousel header");
  assert.ok(sp.includes("<FloorSelect floors={roster}"), "the header's floor name opens FloorSelect");
  assert.ok(sp.includes('className="syp-nav"'), "a contextual nav footer exists");
  // the nav footer (below) must come AFTER the plan pane in source order (i.e. below the canvas)
  // Locates the plan pane by its leading classes, not an exact attribute string: the className is a
  // template literal now (it appends syp-plan--ar when the widget reports the plan's height). The
  // assertion here is about SOURCE ORDER, which that change does not affect.
  const panePos = sp.search(/className=\{?[`"]syp-pane syp-plan/);
  const navPos = sp.indexOf('className="syp-nav"');
  const floorbarPos = sp.indexOf('className="syp-floorbar"');
  assert.ok(floorbarPos > 0 && floorbarPos < panePos, "floor header is above the canvas");
  assert.ok(panePos > 0 && navPos > panePos, "nav footer is rendered after (below) the canvas pane");
  // the always-on 5-tab rail is gone (replaced by the guided footer + ••• Go-to)
  assert.ok(!sp.includes('role="tablist"'), "the 5-tab rail tablist is removed");
});

test("one shared bottom bar: linear 5-step Back/center-step/Next (no skips) + a state-derived Submit CTA", () => {
  // NAV-FIX: the linear flow is Background → Layout → Placement → Camera Angles → Submit (views is in-flow).
  // Section A: the order lives in lib/survey-rail.js (RAIL_STEPS); stepAfter/stepBefore move exactly one step.
  assert.ok(sp.includes("const nextStep = stepAfter(railStep);") && sp.includes("const prevStep = stepBefore(railStep);"), "prev/next derived from the canonical order");
  // the forward control NAMES the next step itself — through nextLabel(), which is NEXT_PROMPT except on
  // Camera Angles with no photos attached, where photos are optional and Next reads "Skip" (section L).
  assert.ok(sp.includes("onClick={() => goRail(nextStep)}>{nextLabel(nextStep)} <svg"), "the Next label is the next step's prompt");
  assert.ok(sp.includes("const nextLabel = (step) => (railStep === \"views\" && camsWithPhoto === 0 ? \"Skip\" : NEXT_PROMPT[step]);"),
    "Camera Angles with no photos: Next reads Skip and still advances to Approval");
  // the center button shows the CURRENT step and opens Survey Navigation upward
  assert.ok(sp.includes('className="syp-nav-center"') && sp.includes("{STEP_LABEL[railStep]"), "center button shows the current step name");
  assert.ok(sp.includes('renderNavPop(navMenuOpen, setNavMenuOpen, "up-center")'), "center opens the Survey Navigation popover upward");
  // A gated Next is never a silent no-op — but the REASON is helper text, not the button's label.
  // The control keeps the next step's one-word name (label ladder: "Draw the structure first" is a
  // sentence, and a sentence is not a button) and the reason renders beside it as quiet meta text,
  // visible rather than a hover tooltip because a phone has no hover.
  assert.ok(sp.includes('<span className="syp-nav-hint" id={navHintId}>{nextHint}</span>'), "the gate reason renders as quiet text, not as the button label");
  assert.ok(/<button className="syp-nav-cta muted" disabled aria-describedby=\{nextHint \? navHintId : undefined\}>\{nextLabel\(nextStep\)\}/.test(sp),
    "the gated button keeps the step name and is described by the reason");
  assert.ok(!sp.includes("{nextHint || nextLabel(nextStep)}"), "the hint is no longer a button label");
  // Submit CTA (label just 'Submit', not Re-submit) drives the canonical submit / continue
  assert.ok(/label: "Approval"/.test(sp) && !/label: "Re-submit"/.test(sp) && sp.includes("Continue to Proposal"), "Submit CTA = Approval / Awaiting / Continue (no Re-submit label)");
  assert.ok(sp.includes('await onSubmitTool("site_survey")'), "CTA drives the canonical submit (onSubmitTool)");
  assert.ok(/if \(onClose\) \{ try \{ onClose\(\)/.test(sp), "Submit closes the tool out after submitting (back to the hub)");
  assert.ok(sp.includes("onContinue && onContinue()"), "approved → Continue reuses onContinue");
  assert.ok(gw.includes("surveyOk={surveyOk}") && gw.includes("onSubmitTool=") && gw.includes("onContinue={() => browse(\"proposal\")}"), "gateway wires surveyOk/onSubmitTool/onContinue");
  assert.ok(sp.includes("{customer && footer}"), "customer approve surface stays standalone");
});

test("phone: the bottom bar wraps — the action takes its own row and the step stays centred", () => {
  // At 375px the bar has 347px for [Back] [step] [action], and the right slot gets ~118px while a gate
  // hint ("Draw the structure first") or a state label ("Awaiting customer approval") is 190–215px wide.
  // justify-content:flex-end made that slot overflow LEFTWARD, printing its label straight across the
  // step button. These three rules are the fix; the ::after spacer is what keeps the step dead-centre
  // on row one once the action has been pushed down to row two.
  const mq = sp.slice(sp.indexOf(".syp-nav-sep{"));
  assert.ok(/@media \(max-width:700px\)\{\s*\.syp-nav\{flex-wrap:wrap/.test(mq), "the nav bar wraps at phone width");
  assert.ok(/\.syp-nav::after\{content:"";order:1;flex:1 1 0/.test(mq), "a spacer mirrors Back so the step stays centred");
  assert.ok(/\.syp-nav > \.syp-nav-side--right\{order:2;flex:1 0 100%/.test(mq), "the action slot takes a full row, after the spacer");
});

test("FloorSelect exposes full parity: switch/add/rename/duplicate/delete", () => {
  const f = sp.slice(sp.indexOf("function FloorSelect("));
  for (const bit of ["onSwitch", "onAdd", "onRename", "onDuplicate", "onDelete", "+ Add floor", "Rename", "Duplicate", "Delete"]) {
    assert.ok(f.includes(bit), `FloorSelect has ${bit}`);
  }
  assert.ok(!f.includes("disabled={only}"), "section C: the ONLY floor can be deleted (reset to a blank Floor 1) — no longer greyed out");
  assert.ok(f.includes("disabled={locked}"), "…but a submitted survey still locks it");
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
