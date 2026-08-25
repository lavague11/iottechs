// Runs once when the Next.js server process starts (Node runtime only). Starts the 24-hour
// appointment-reminder sweep on a timer, so no external cron is needed — it works on Render today
// and on any VPS the app is later moved to. Dedup lives in the DB, so overlapping runs are safe.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
}
