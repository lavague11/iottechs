// #2 signature-chasing cadence (pure). Proves when a sent-but-unsigned proposal is DUE for a reminder:
// first nudge from day 2, then ≥4 days between reminders, max 3 reminders, and never past the 30-day deadline.
import test from "node:test";
import assert from "node:assert/strict";
import { signatureNudge, FIRST_NUDGE_DAY, REMINDER_GAP_DAYS, MAX_REMINDERS } from "../lib/signature-cadence.js";

// signatureEmailCount = reminders already sent (the initial proposal-send email is NOT logged as one).
test("not due in the first days after sending", () => {
  assert.equal(signatureNudge({ daysWaiting: 1, signatureEmailCount: 0 }).due, false);  // no reminders yet, too soon
  assert.equal(signatureNudge({ daysWaiting: 0, signatureEmailCount: 0 }).due, false);
});

test("first reminder is due at day 2 (no reminder sent yet; the gap doesn't apply to the first)", () => {
  const n = signatureNudge({ daysWaiting: FIRST_NUDGE_DAY, signatureEmailCount: 0, daysSinceLastEmail: null });
  assert.equal(n.due, true);
  assert.equal(n.remindersSent, 0);
  assert.equal(n.nextReminder, 1);
});

test("the gap applies BETWEEN reminders", () => {
  // One reminder already sent (count=1 → remindersSent 1); last email 1 day ago → too soon.
  assert.equal(signatureNudge({ daysWaiting: 8, signatureEmailCount: 1, daysSinceLastEmail: 1 }).due, false);
  // ≥4 days since the last reminder → due again.
  const n = signatureNudge({ daysWaiting: 10, signatureEmailCount: 1, daysSinceLastEmail: REMINDER_GAP_DAYS });
  assert.equal(n.due, true);
  assert.equal(n.remindersSent, 1);
});

test("stops after the reminder cap and at the deadline", () => {
  assert.equal(signatureNudge({ daysWaiting: 20, signatureEmailCount: MAX_REMINDERS, daysSinceLastEmail: 10 }).due, false); // cap reached
  assert.equal(signatureNudge({ daysWaiting: 29, signatureEmailCount: 0, daysToDeadline: 1 }).due, false);                   // at deadline
  assert.equal(signatureNudge({ daysWaiting: 35, signatureEmailCount: 0, daysToDeadline: -2 }).due, false);                  // past deadline
});
