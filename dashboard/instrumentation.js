// Runs once when the Next.js server process starts (Node runtime only). Starts the 24-hour
// appointment-reminder sweep on a timer, so no external cron is needed — it works on Render today
// and on any VPS the app is later moved to. Dedup lives in the DB, so overlapping runs are safe.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Pin the process timezone to Eastern on hosts that don't set TZ (Hostinger runs UTC; Render
  // already sets TZ=America/New_York). The app is Eastern-pinned by design — datetime('now',
  // 'localtime') and all appointment/date formatting depend on it. Assigning process.env.TZ
  // triggers Node's tzset(), so it applies to both JS Date and the in-process SQLite localtime.
  if (!process.env.TZ) process.env.TZ = "America/New_York";

  if (globalThis.__apptReminderStarted) return;   // survive HMR / repeated registration in dev
  globalThis.__apptReminderStarted = true;

  // Stage 5 item 11 of docs/customer-flow-v2.md removed the AUTOMATIC appointment reminders — the
  // day-before and the same-day sweep. The manual per-appointment "Remind" button is untouched
  // (sendAppointmentEmailAction), so the office can still send one deliberately. lib/appointment-
  // reminders.js and its model are left in the tree: nothing calls the sweep, so nothing fires.

  setTimeout(sweepReceivables, 120_000);              // first sweep ~2 min after boot
  setInterval(sweepReceivables, 6 * 60 * 60 * 1000);  // then every 6 hours (cheap + idempotent)

  // Scheduled add-on approval emails: send any whose scheduledSendAt has passed, skipping ones no longer
  // pending (approved/voided/deleted). Idempotent — a sent/cleared add-on drops its schedule.
  const sweepAddendumEmails = async () => {
    try {
      const { sendDueAddendumEmails } = await import("./lib/addendum-emails.js");
      const r = await sendDueAddendumEmails();
      if (r?.sent) console.log(`[addendum] sent ${r.sent} scheduled approval email(s)`);
    } catch (e) { console.error("[addendum] scheduled-email sweep failed:", e?.message || e); }
  };
  setTimeout(sweepAddendumEmails, 100_000);            // ~1.5 min after boot
  setInterval(sweepAddendumEmails, 15 * 60 * 1000);    // then every 15 minutes

  // Scheduled signature-request emails: same pattern — send any due, skip ones no longer live (signed,
  // voided, revised, demo). Idempotent; a sent/stale schedule clears itself.
  const sweepSignatureEmails = async () => {
    try {
      const { sendDueSignatureEmails } = await import("./lib/signature-emails.js");
      const r = await sendDueSignatureEmails();
      if (r?.sent) console.log(`[signature] sent ${r.sent} scheduled request email(s)`);
    } catch (e) { console.error("[signature] scheduled-email sweep failed:", e?.message || e); }
  };
  setTimeout(sweepSignatureEmails, 110_000);           // ~2 min after boot
  setInterval(sweepSignatureEmails, 15 * 60 * 1000);   // then every 15 minutes

  // Scheduled invoice sends + automatic invoice reminders (3 days before due + on the due date, if unpaid).
  const sweepInvoiceEmails = async () => {
    try {
      const { sendDueInvoiceEmails } = await import("./lib/invoice-emails.js");
      const r = await sendDueInvoiceEmails();
      if (r?.sent || r?.reminders) console.log(`[invoice] sent ${r.sent || 0} invoice(s), ${r.reminders || 0} reminder(s)`);
    } catch (e) { console.error("[invoice] sweep failed:", e?.message || e); }
  };
  setTimeout(sweepInvoiceEmails, 130_000);             // ~2 min after boot
  setInterval(sweepInvoiceEmails, 60 * 60 * 1000);     // then hourly (reminders are day-grained)

  // Work orders (docs/WORK_ORDERS.md, Stage 4): two nudges, both claimed once in the DB so repeats and
  // overlapping runs are harmless.
  //   • End of day — 12 hours after a technician's own check-in, not on a clock, so a crew that starts
  //     at 7am is reminded at 7pm and one that starts at 2pm at 2am. The office is told either way.
  //   • Sign-off — the customer was asked to sign the finished work off a day ago and hasn't.
  const sweepWorkOrders = async () => {
    try {
      // Stage 5 item 8: the automatic ~24h sign-off chase is gone. The sign-off REQUEST still fires when
      // the last line completes, and the office can still ask again by hand (requestSignoffAction) — the
      // customer is simply no longer chased on a timer. sweepSignoffReminders is left unused in
      // lib/wo-notify.js rather than deleted, so re-enabling it is one line.
      const { sweepEndOfDayReminders } = await import("./lib/wo-notify.js");
      const d = await sweepEndOfDayReminders();
      if (d?.sent) console.log(`[workorder] reminded ${d.sent} technician(s) to end their day`);
    } catch (e) { console.error("[workorder] sweep failed:", e?.message || e); }
  };
  setTimeout(sweepWorkOrders, 140_000);             // ~2.5 min after boot
  setInterval(sweepWorkOrders, 60 * 60 * 1000);     // then hourly; both are time-since, not time-of-day
}
