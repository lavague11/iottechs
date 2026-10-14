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
}
