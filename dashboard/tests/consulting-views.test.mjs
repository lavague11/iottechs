// Consulting reorg — Camera Views optionality + gate (P5).
// Views are optional by default: they never block the Consulting (site_survey) gate unless the project
// is explicitly views_required. "Skip for now" (mockup_skipped_at) is a reversible convenience; starting
// Views never makes them required. This replicates surveyStageSatisfied's mockup rule and proves the
// matrix, and source-reads the db wiring (we don't import db.js — it opens the real sqlite DB).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// Pure replica of the gate's mockup rule (lib/db.js surveyStageSatisfied).
function satisfied({ surveyHas, surveyAcc, mockupHas, mockupAcc, mockupSkipped, viewsRequired }) {
  const ok = (has, acc) => !has || !!acc;
  const mockupOk = viewsRequired ? (mockupHas && ok(mockupHas, mockupAcc)) : (!!mockupSkipped || ok(mockupHas, mockupAcc));
  return ok(surveyHas, surveyAcc) && mockupOk;
}

test("gate matrix: Views optional by default, required only when views_required", () => {
  const S = { surveyHas: true, surveyAcc: true }; // survey approved throughout
  // default (not required)
  assert.equal(satisfied({ ...S, mockupHas: false }), true, "no mockup data → passes");
  assert.equal(satisfied({ ...S, mockupHas: true, mockupAcc: false }), false, "mockup has data but unapproved → blocks (approve or skip)");
  assert.equal(satisfied({ ...S, mockupHas: true, mockupAcc: false, mockupSkipped: true }), true, "skip-for-now on unapproved mockup data → passes");
  assert.equal(satisfied({ ...S, mockupHas: true, mockupAcc: true }), true, "mockup approved → passes");
  // required
  assert.equal(satisfied({ ...S, viewsRequired: true, mockupHas: false }), false, "views_required + no mockup → blocks");
  assert.equal(satisfied({ ...S, viewsRequired: true, mockupHas: true, mockupAcc: false, mockupSkipped: true }), false, "views_required ignores skip — must be approved");
  assert.equal(satisfied({ ...S, viewsRequired: true, mockupHas: true, mockupAcc: true }), true, "views_required + approved → passes");
  // the survey arm is unchanged — an unapproved survey always blocks regardless of views
  assert.equal(satisfied({ surveyHas: true, surveyAcc: false, mockupHas: false }), false, "unapproved survey blocks");
});

test("db wiring: migration columns, setMockupSkipped/setViewsRequired, gate honors the flags, facts exposed", () => {
  const db = read("lib/db.js");
  assert.ok(db.includes('ADD COLUMN mockup_skipped_at TEXT'), "mockup_skipped_at column migration");
  assert.ok(db.includes('ADD COLUMN views_required INTEGER DEFAULT 0'), "views_required column migration");
  assert.ok(db.includes("export function setMockupSkipped(accessId, skip, byName)"), "setMockupSkipped exists");
  assert.ok(db.includes("export function setViewsRequired(accessId, required)"), "setViewsRequired exists");
  assert.ok(db.includes("const mockupOk = p.views_required ? (meta.mockup.has && ok(meta.mockup, \"mockup\")) : (!!p.mockup_skipped_at || ok(meta.mockup, \"mockup\"));"), "gate honors views_required + mockup_skipped_at");
  assert.ok(db.includes("mockup_skipped: !!p.mockup_skipped_at,") && db.includes("views_required: !!p.views_required,"), "facts exposed for the client/deck");
});

test("rebuild: Views folded into Plan — no Start/Skip splash; Camera Photos reachable; Submit summary", () => {
  const shell = read("app/project/[accessId]/system-planner.jsx");
  const actions = read("app/project/[accessId]/actions.js");
  // The Start/Skip "Views" gate is gone — Views is no longer a blocking step.
  assert.ok(!shell.includes("function ViewsStart("), "the Start/Skip splash component is removed");
  assert.ok(!/\bStart Views\b/.test(shell), "no 'Start Views' splash copy");
  // The phone-mockup photo surface is still reachable, as a non-gating 'Camera Photos' Go-to entry.
  assert.ok(shell.includes("Camera Photos"), "Camera Photos reachable from the Go-to menu");
  // Step 3 shows a real summary instead of a Start/Skip strip.
  assert.ok(shell.includes("function SubmitSummary("), "the Submit step renders a real summary (thumbnail/count/missing photos)");
  // The server actions remain (still used elsewhere / for views_required), even though the splash is gone.
  assert.ok(actions.includes("export async function skipViewsAction(accessId, skip)"), "skipViewsAction server action still exists");
  assert.ok(actions.includes("export async function setViewsRequiredAction(accessId, required)"), "setViewsRequiredAction server action still exists");
});

test("P7: Review status surface summarizes both deliverables (Camera Views shown even when not started)", () => {
  const gw = read("app/project/[accessId]/gateway-client.jsx");
  const shell = read("app/project/[accessId]/system-planner.jsx");
  assert.ok(gw.includes('<div className="syp-submit-head">Consulting deliverables</div>'), "the deliverables header");
  assert.ok(gw.includes('const mkSkipped = !!lp.mockup_skipped_at, viewsReq = !!lp.views_required;'), "reads the skip/required state");
  assert.ok(gw.includes('{viewsReq ? "Required — not started" : mkSkipped ? "Skipped" : "Optional — not started"}'), "Camera Views state pill when not started (office)");
  assert.ok(shell.includes(".syp-vpill"), "the status pill is styled");
});

test("P9: dead code removed — the orphaned standalone survey-cameras.jsx is gone", () => {
  let gone = false;
  try { readFileSync(new URL("../app/project/[accessId]/survey-cameras.jsx", import.meta.url)); } catch { gone = true; }
  assert.ok(gone, "survey-cameras.jsx deleted (replaced by survey-devices.jsx)");
});
