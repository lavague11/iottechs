// Closed-project edit-lock: a closed (lost_at) project is read-only history. projectEditLock (lib/db.js)
// is the guard; this drift test proves every deal-mutating server action calls it (reads are untouched).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
function fnBody(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const after = src.indexOf("\nexport async function ", start + 1);
  return src.slice(start, after === -1 ? src.length : after);
}

test("deal-mutating actions enforce the closed-project edit-lock", () => {
  const pa = read("../app/project/[accessId]/proposal-actions.js");
  for (const fn of ["saveProposalDraftAction", "recordPaymentAction", "saveToolDataAction"])
    assert.ok(/projectEditLock\(accessId\)/.test(fnBody(pa, fn)), `${fn} checks projectEditLock`);
  const ac = read("../app/project/[accessId]/actions.js");
  for (const fn of ["setStage", "addAssignmentAction"])
    assert.ok(/projectEditLock\(accessId\)/.test(fnBody(ac, fn)), `${fn} checks projectEditLock`);
});

test("Maya's apply dispatch refuses edits on a closed project (except close + pause_nudges)", () => {
  const ai = read("../app/project/[accessId]/ai-actions.js");
  assert.match(ai, /name !== "close_project" && name !== "pause_nudges"\) \{ const lk = projectEditLock\(accessId\)/, "apply dispatch guards all but close_project + pause_nudges");
  assert.ok(/function proposalPreview[\s\S]{0,120}projectEditLock\(accessId\)/.test(ai), "proposal edits preview the lock");
});

test("nudge pause is one flag: the UI action and Maya both write setNudgePause; UI action is NOT edit-locked", () => {
  const ac = read("../app/project/[accessId]/actions.js");
  const body = fnBody(ac, "setNudgePauseAction");
  assert.ok(/setNudgePause\(accessId/.test(body), "UI action writes the shared nudge_paused flag");
  assert.ok(!/projectEditLock\(accessId\)/.test(body), "pause/resume is allowed even on a closed project");
  assert.ok(/\["admin", "manager", "sales"\]/.test(body), "office-staff only");
  const ai = read("../app/project/[accessId]/ai-actions.js");
  assert.ok(/name === "pause_nudges"\)[\s\S]{0,120}setNudgePause\(accessId/.test(ai), "Maya's pause_nudges writes the SAME flag");
});

test("large-waiver alert fires on the INCREASE only — re-saving the same waiver won't re-alert", () => {
  const pa = read("../app/project/[accessId]/proposal-actions.js");
  const body = fnBody(pa, "saveProposalDraftAction");
  assert.ok(/priorWaived = waivedValueOf/.test(body), "captures the prior waived value before saving");
  assert.ok(/now >= threshold && now > priorWaived/.test(body), "alerts only when waived value crosses the threshold AND increases");
});
