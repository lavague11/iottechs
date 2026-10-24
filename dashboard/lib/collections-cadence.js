// Collections cadence (#1, queue-for-confirm) — the money twin of signature-cadence.js. Decides whether an
// unpaid DEPOSIT or final BALANCE is due for a reminder, from how long it's been owed, when it was last
// reminded, and how many reminders have gone out. No hard deadline (unlike signatures, which auto-close at
// 30 days — a balance is owed until paid). No auto-send: a human confirms each reminder (request_payment).
// No new storage: the caller derives the inputs from the receivable's aging and the project's "Payment
// reminder emailed" events.

export const FIRST_REMINDER_DAY = 3;    // don't nudge about money in the first 3 days it's due
export const REMINDER_GAP_DAYS = 5;     // ≥5 days between payment reminders (more patient than signatures)
export const MAX_REMINDERS = 4;         // chase a balance a bit longer than a signature

// input: { daysOwed, daysSinceLastEmail, reminderEmailCount }
//   daysOwed           — days the amount has been due (receivable agingDays)
//   reminderEmailCount — count of "payment reminder emailed" events = reminders ALREADY sent (there is no
//     unlogged initial payment-reminder email, so every such event is a reminder — no off-by-one)
//   daysSinceLastEmail — days since the most recent reminder (null = none yet / unknown)
// Returns { due, remindersSent, reason?, nextReminder? }.
export function paymentNudge({ daysOwed = 0, daysSinceLastEmail = null, reminderEmailCount = 0 } = {}) {
  const dw = Math.max(0, Math.floor(+daysOwed || 0));
  const remindersSent = Math.max(0, Math.floor(+reminderEmailCount || 0));
  if (remindersSent >= MAX_REMINDERS) return { due: false, remindersSent, reason: "reminder limit reached" };
  if (dw < FIRST_REMINDER_DAY) return { due: false, remindersSent, reason: `too soon (reminder from day ${FIRST_REMINDER_DAY})` };
  // The gap applies only BETWEEN reminders.
  if (remindersSent >= 1 && daysSinceLastEmail != null && daysSinceLastEmail < REMINDER_GAP_DAYS) return { due: false, remindersSent, reason: "reminded recently" };
  return { due: true, remindersSent, nextReminder: remindersSent + 1 };
}
