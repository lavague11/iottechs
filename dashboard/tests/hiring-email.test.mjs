// Candidate-facing hiring emails: templates exist, send is guarded (demo/no-email/no-key), and each
// stage trigger is wired. Asserted at source (same approach as the other hiring tests) since the send
// path pulls in the Next runtime + live DB.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("hiring email templates + guarded sender exist", () => {
  const e = read("../lib/email.js");
  assert.ok(e.includes("const HIRING_EMAIL"), "template table exists");
  for (const k of ["applied", "assessment_review", "phone", "in_person", "declined", "hired"]) {
    assert.ok(new RegExp(`\\b${k}\\s*:`).test(e), `template '${k}' present`);
  }
  assert.ok(e.includes("export async function emailHiringStage"), "emailHiringStage exported");
  assert.ok(e.includes("export async function emailHiringForStatus"), "emailHiringForStatus exported");
  assert.ok(e.includes("@journey-test\\.local") || e.includes("journey-test"), "demo/test applications are skipped");
  assert.ok(e.includes('includes("@")'), "missing email address is a no-op");
  assert.ok(/HIRING_STATUS_EMAIL\s*=\s*\{[^}]*phone[^}]*in_person/.test(e), "status→template map covers phone + in_person");
});

test("each hiring stage trigger is wired to send", () => {
  const apply = read("../app/api/apply/route.js");
  assert.ok(apply.includes('emailHiringStage(app, "applied")'), "apply → applied email");

  const asx = read("../app/assessment/[appId]/actions.js");
  assert.ok(asx.includes('emailHiringStage(a.app, "assessment_review")'), "assessment submit → review email");

  const ob = read("../app/onboarding/actions.js");
  assert.ok(ob.includes("emailHiringForStatus(app, next)"), "advance → status email");
  assert.ok(ob.includes("emailHiringForStatus(r, r.status)"), "stage move → status email");
  assert.ok(ob.includes('emailHiringStage(app, "declined")'), "decline → declined email");
  assert.ok(ob.includes('emailHiringStage(app, "hired")') || ob.includes('emailHiringStage(r.app, "hired")'), "hire → welcome email");
  assert.ok(ob.includes("after(() =>") && ob.includes("fireHiringEmail"), "sends are fire-and-forget (non-blocking)");
});
