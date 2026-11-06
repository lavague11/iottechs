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

  const run = async () => {
    try {
      const { sendDueAppointmentReminders } = await import("./lib/appointment-reminders.js");
      await sendDueAppointmentReminders();
    } catch (e) { console.error("[reminders] sweep failed:", e?.message || e); }
  };

  setTimeout(run, 90_000);                  // first sweep shortly after boot
  setInterval(run, 30 * 60 * 1000);         // then every 30 minutes

  // Finance sweep: auto-close approved-but-unsigned projects whose 30-day signature deadline has passed
  // ("Closed — Unsigned"). Server-side so the status is correct even if nobody opens the page. The query
  // only matches OPEN deals, so it's idempotent — overlapping/repeat runs never double-close or duplicate
  // the close event. Signed / deposit / completed projects are never touched.
  const sweepReceivables = async () => {
    try {
      const { autoCloseExpiredUnsigned } = await import("./lib/db.js");
      const r = autoCloseExpiredUnsigned();
      if (r.closed) console.log(`[receivables] auto-closed ${r.closed} unsigned project(s) past the signature deadline`);
    } catch (e) { console.error("[receivables] auto-close sweep failed:", e?.message || e); }
  };
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
}
