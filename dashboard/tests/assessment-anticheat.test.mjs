// Assessment anti-cheat: server-anchored timer (refresh can't reset it), page-leave counting with a
// final warning after 2, a resume notice on return, and partial submit (blanks allowed). The pieces
// are asserted at source (same approach as the hiring-list test) since the client/actions pull in the
// Next runtime + a live DB.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the timer is anchored server-side (opened_at), not on a client/localStorage clock", () => {
  const actions = read("../app/assessment/[appId]/actions.js");
  assert.ok(actions.includes("export async function openAssessmentAction"), "openAssessmentAction exists");
  assert.ok(actions.includes("export async function syncAssessmentAction"), "syncAssessmentAction exists");
  assert.ok(actions.includes("opened_at") && actions.includes("remainingSecFrom"), "remaining time derives from server opened_at");
  assert.ok(actions.includes("serverTimedOut") && actions.includes("remainingSecFrom(openedAt) <= 0"), "submit re-checks the clock server-side");

  const client = read("../app/assessment/[appId]/assessment-client.jsx");
  assert.ok(client.includes("deadlineRef") && client.includes("openAssessmentAction"), "client anchors to the server deadline");
  assert.ok(!/asx_start_/.test(client), "the localStorage timer anchor (the resettable hack) is gone");

  const page = read("../app/assessment/[appId]/page.jsx");
  assert.ok(page.includes("resuming") && page.includes("initialRemainingSec") && page.includes("initialLeaves"), "page threads resume state to the client");
});

test("leaving the page is counted server-side; a refresh resumes instead of resetting", () => {
  const route = read("../app/api/assessment/leave/route.js");
  assert.ok(/export async function POST/.test(route), "leave API route exists (survives a beacon on unload)");
  assert.ok(route.includes("leaves") && route.includes("(cur.leaves || 0) + 1"), "increments the leave count");
  assert.ok(route.includes("staff") && route.includes("!cur.opened_at"), "staff QA don't inflate it; only a real open exam counts");

  const client = read("../app/assessment/[appId]/assessment-client.jsx");
  assert.ok(client.includes("sendBeacon") && client.includes("/api/assessment/leave"), "beacons each departure");
  assert.ok(client.includes("visibilitychange") && client.includes("pagehide"), "catches tab-hide and unload");
  assert.ok(client.includes("leftPageRef"), "dedups one count per departure");
});

test("return shows a resume notice; 2+ leaves escalate to a final warning", () => {
  const client = read("../app/assessment/[appId]/assessment-client.jsx");
  assert.ok(client.includes("We noticed you left the page"), "resume notice copy");
  assert.ok(client.includes("Continue where you left off"), "continue-where-you-left-off copy");
  assert.ok(client.includes("Time remaining"), "shows the remaining time on return");
  assert.ok(client.includes("warnFinal") && client.includes("leaves >= 2"), "final warning triggers after 2 leaves");
  assert.ok(client.includes("Final warning") && client.includes("Do not leave the assessment"), "final warning copy");
});

test("partial submit: blanks are allowed (no all-answered gate)", () => {
  const client = read("../app/assessment/[appId]/assessment-client.jsx");
  assert.ok(!/disabled=\{busy \|\| !allAnswered\}/.test(client), "submit is not gated on every question being answered");
  assert.ok(client.includes("handleSubmitClick") && client.includes("!allAnswered && !confirmSubmit"), "two-step confirm when blanks remain");
  assert.ok(client.includes("scored 0"), "tells the candidate blanks are scored 0");
});
