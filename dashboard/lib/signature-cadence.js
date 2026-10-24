// Signature-chasing cadence (#2, queue-for-confirm). PURE: decide whether a SENT-but-UNSIGNED proposal is due
// for a reminder, from how long it's been waiting, when it was last emailed, how many reminders have gone out,
// and how close the 30-day auto-close deadline is. No auto-send — a staff member confirms each nudge (the
// existing request_signature action does the send). No new storage: the caller derives the inputs from the
// receivable's aging/deadline and the project's "Signature request emailed" events.

export const FIRST_NUDGE_DAY = 2;     // don't nudge in the first 2 days after sending
export const REMINDER_GAP_DAYS = 4;   // leave ≥4 days between reminders
export const MAX_REMINDERS = 3;       // at most 3 reminders AFTER the initial send

// input: { daysWaiting, daysSinceLastEmail, signatureEmailCount, daysToDeadline }
//   daysWaiting        — days since the proposal was sent (receivable agingDays)
//   signatureEmailCount — count of "signature request emailed" events = reminders ALREADY SENT. The initial
//     proposal-send email (sendProposalAction) does NOT log this event — only requestSignatureEmailAction
//     does — so every such event is a reminder (no off-by-one for the initial send).
//   daysSinceLastEmail — days since the most recent such reminder (null = none yet / unknown)
//   daysToDeadline     — days until the 30-day unsigned auto-close (null = unknown)
// Returns { due, remindersSent, reason?, nextReminder? }.
export function signatureNudge({ daysWaiting = 0, daysSinceLastEmail = null, signatureEmailCount = 0, daysToDeadline = null } = {}) {
  const dw = Math.max(0, Math.floor(+daysWaiting || 0));
  const remindersSent = Math.max(0, Math.floor(+signatureEmailCount || 0));   // each logged signature-request event is a reminder
  if (remindersSent >= MAX_REMINDERS) return { due: false, remindersSent, reason: "reminder limit reached" };
  if (daysToDeadline != null && daysToDeadline <= 1) return { due: false, remindersSent, reason: "at the signature deadline" };
  if (dw < FIRST_NUDGE_DAY) return { due: false, remindersSent, reason: `too soon (nudge from day ${FIRST_NUDGE_DAY})` };
  // The gap applies only BETWEEN reminders — the initial send doesn't block the first reminder (so a day-2
  // nudge is allowed even though the proposal was sent 2 days ago).
  if (remindersSent >= 1 && daysSinceLastEmail != null && daysSinceLastEmail < REMINDER_GAP_DAYS) return { due: false, remindersSent, reason: "emailed recently" };
  return { due: true, remindersSent, nextReminder: remindersSent + 1 };
}
