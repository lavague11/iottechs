// Fix #1 — auto review request on completion. email.js uses an extensionless `./db` import (Next
// resolves it; bare node doesn't), so these are source drift-guards like the other email tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const email = readFileSync(new URL("../lib/email.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/project/[accessId]/actions.js", import.meta.url), "utf8");
const propActions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

test("emailReviewRequest exists and is fully gated", () => {
  const i = email.indexOf("export async function emailReviewRequest");
  assert.ok(i >= 0, "helper exists");
  const fn = email.slice(i, i + 2600);
  assert.ok(fn.includes("if (!emailEnabled())"), "respects email gating (Resend key + EMAIL_DISABLED/test)");
  assert.ok(/@journey-test\\?\.local/.test(fn) && fn.includes('source === "journey-test"'), "never sends for demo/test projects");
  assert.ok(fn.includes("review_requested_at") && fn.includes("already-sent"), "sends at most once");
  assert.ok(fn.includes("p.completed_at") && fn.includes("not-complete"), "requires the job to be complete");
  assert.ok(fn.includes('financialState !== "collected"'), "requires paid in full");
  assert.ok(fn.includes("secretValue(\"REVIEW_URL\")") && fn.includes("ctaUrl"), "external review CTA (REVIEW_URL)");
  assert.ok(fn.includes("markReviewRequested(accessId)"), "stamps the one-time flag on success");
});

test("the separate review request was RETIRED — the completion report asks instead", () => {
  // docs/customer-flow-v2.md Stage 5 item 10: one email at paid-in-full carries the receipt and the
  // completion report, and the report (email + portal Completion card) holds the "Leave us a review"
  // button. A standalone review email would be a second ask for the same thing.
  assert.ok(!/emailReviewRequest/.test(actions), "completeProjectAction no longer sends one");
  assert.ok(!/emailReviewRequest/.test(propActions), "nor do the payment paths");
  // The sender itself is left in lib/email.js, unused, so re-enabling it is one line rather than a rewrite.
  assert.ok(/export async function emailReviewRequest/.test(email), "the sender is kept for rollback");
});

test("db has the review_requested_at column + idempotent marker", () => {
  assert.ok(db.includes('ADD COLUMN review_requested_at'), "ensure-column migration");
  assert.ok(db.includes("export function markReviewRequested") && db.includes("COALESCE(review_requested_at"),
    "idempotent setter keeps the first stamp");
});
