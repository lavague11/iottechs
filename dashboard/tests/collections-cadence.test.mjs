// #1 collections cadence (pure). First payment reminder from day 3, ≥5 days between reminders, max 4, no
// hard deadline. signatureEmailCount-style off-by-one is avoided: every "payment reminder emailed" event is
// a reminder (there is no unlogged initial payment-reminder email).
import test from "node:test";
import assert from "node:assert/strict";
import { paymentNudge, FIRST_REMINDER_DAY, REMINDER_GAP_DAYS, MAX_REMINDERS } from "../lib/collections-cadence.js";

test("not due in the first days it's owed", () => {
  assert.equal(paymentNudge({ daysOwed: 1, reminderEmailCount: 0 }).due, false);
  assert.equal(paymentNudge({ daysOwed: FIRST_REMINDER_DAY - 1, reminderEmailCount: 0 }).due, false);
});

test("first reminder due at day 3 (no reminder yet; gap not applied to the first)", () => {
  const n = paymentNudge({ daysOwed: FIRST_REMINDER_DAY, reminderEmailCount: 0, daysSinceLastEmail: null });
  assert.equal(n.due, true);
  assert.equal(n.remindersSent, 0);
  assert.equal(n.nextReminder, 1);
});

test("the gap applies between reminders", () => {
  assert.equal(paymentNudge({ daysOwed: 8, reminderEmailCount: 1, daysSinceLastEmail: 2 }).due, false);                 // too soon
  assert.equal(paymentNudge({ daysOwed: 12, reminderEmailCount: 1, daysSinceLastEmail: REMINDER_GAP_DAYS }).due, true); // gap met
});

test("stops after the reminder cap (no deadline for a balance)", () => {
  assert.equal(paymentNudge({ daysOwed: 40, reminderEmailCount: MAX_REMINDERS, daysSinceLastEmail: 30 }).due, false);
  assert.equal(paymentNudge({ daysOwed: 40, reminderEmailCount: MAX_REMINDERS - 1, daysSinceLastEmail: 30 }).due, true);
});
