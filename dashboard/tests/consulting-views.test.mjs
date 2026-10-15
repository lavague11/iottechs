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

test("Views Start/Skip UI + action wiring", () => {
  const shell = read("app/project/[accessId]/system-planner.jsx");
  const actions = read("app/project/[accessId]/actions.js");
  const gw = read("app/project/[accessId]/gateway-client.jsx");
  assert.ok(shell.includes("function ViewsStart("), "the Start/Skip entry component exists");
  assert.ok(shell.includes("(hasViews || viewsStarted)"), "the mockup opens once started or data exists, else the strip shows");
  assert.ok(shell.includes("onStart={() => { setViewsStarted(true); if (skipped) persistSkip(false); }}"), "Start opens Views + un-skips");
  assert.ok(shell.includes("onSkip={() => { persistSkip(true); setRailStep(\"plan\"); }}"), "Skip for now persists + leaves Views");
  assert.ok(actions.includes("export async function skipViewsAction(accessId, skip)"), "skipViewsAction server action");
  assert.ok(actions.includes("export async function setViewsRequiredAction(accessId, required)"), "setViewsRequiredAction server action");
  assert.ok(gw.includes("onSkipViews={(cView === \"customer\" || viewOnly) ? null : (skip) => skipViewsAction(lp.access_id, skip)}"), "gateway wires onSkipViews (office only)");
  assert.ok(gw.includes("mockupSkipped={!!lp.mockup_skipped_at} viewsRequired={!!lp.views_required}"), "gateway passes the skip/required state");
});
