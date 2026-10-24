// #2 signature-chasing cadence (pure). Proves when a sent-but-unsigned proposal is DUE for a reminder:
// first nudge from day 2, then ≥4 days between reminders, max 3 reminders, and never past the 30-day deadline.
import test from "node:test";
import assert from "node:assert/strict";
import { signatureNudge, FIRST_NUDGE_DAY, REMINDER_GAP_DAYS, MAX_REMINDERS } from "../lib/signature-cadence.js";

test("not due in the first days after sending", () => {
  assert.equal(signatureNudge({ daysWaiting: 1, signatureEmailCount: 1 }).due, false);  // only the initial send
  assert.equal(signatureNudge({ daysWaiting: 0, signatureEmailCount: 1 }).due, false);
});

test("first reminder is due at day 2 — the initial send does NOT block it via the gap", () => {
  const n = signatureNudge({ daysWaiting: FIRST_NUDGE_DAY, signatureEmailCount: 1, daysSinceLastEmail: 2 });
  assert.equal(n.due, true);
  assert.equal(n.remindersSent, 0);
  assert.equal(n.nextReminder, 1);
});

test("the gap applies BETWEEN reminders", () => {
  // One reminder already sent (count=2 → remindersSent 1); last email 1 day ago → too soon.
  assert.equal(signatureNudge({ daysWaiting: 8, signatureEmailCount: 2, daysSinceLastEmail: 1 }).due, false);
  // ≥4 days since the last reminder → due again.
  const n = signatureNudge({ daysWaiting: 10, signatureEmailCount: 2, daysSinceLastEmail: REMINDER_GAP_DAYS });
  assert.equal(n.due, true);
  assert.equal(n.remindersSent, 1);
});

test("stops after the reminder cap and at the deadline", () => {
  assert.equal(signatureNudge({ daysWaiting: 20, signatureEmailCount: MAX_REMINDERS + 1, daysSinceLastEmail: 10 }).due, false); // cap reached
  assert.equal(signatureNudge({ daysWaiting: 29, signatureEmailCount: 1, daysToDeadline: 1 }).due, false);                       // at deadline
  assert.equal(signatureNudge({ daysWaiting: 35, signatureEmailCount: 1, daysToDeadline: -2 }).due, false);                      // past deadline
});
