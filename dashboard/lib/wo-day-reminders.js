// End-of-day reminder (docs/WORK_ORDERS.md, requirement 23). A technician who checked in on site and
// never closed their day leaves the day's pay unbanked, so at 8 PM they get a nudge and the office is
// told it is outstanding — an admin can close the day for them.
//
// Driven by the hourly sweep in instrumentation.js, like every other reminder here. Two guards keep it
// honest however often that sweep runs:
//   • the hour window — only inside the 8 PM hour, Eastern (the process is Eastern-pinned at boot);
//   • claimWoDayReminder — an INSERT OR IGNORE on wo_events' unique key, so each person is reminded
//     exactly once per day even if the sweep overlaps itself or the process restarts.
import { woUnclosedDays, claimWoDayReminder, localDay, createNotification, notifyRoles, getUserById } from "./db.js";

export const EOD_HOUR = 20;   // 8 PM, Eastern

export function isEodWindow(now = new Date()) {
  return now.getHours() === EOD_HOUR;
}

export async function sendDueDayReminders({ now = new Date(), force = false } = {}) {
  if (!force && !isEodWindow(now)) return { skipped: true, sent: 0 };
  const day = localDay();
  let sent = 0;
  for (const row of woUnclosedDays(day)) {
    if (!claimWoDayReminder(row.wo_id, row.name, day)) continue;   // already reminded today
    const link = `/project/${row.project_access_id}?view=workorder`;
    // The technician, if we know which account they are.
    if (row.user_id != null && getUserById(row.user_id)) {
      createNotification({
        user_id: row.user_id, type: "wo_eod",
        title: "End your day",
        body: `You checked in at ${row.project_access_id} and haven't closed the day. Closing it banks today's pay.`,
        link,
      });
    }
    // And the office, who can close it for them.
    notifyRoles(["admin", "manager"], {
      type: "wo_eod_open",
      title: `${row.name} hasn't ended their day`,
      body: `${row.name} checked in at ${row.project_access_id} and hasn't closed the day. You can close it for them.`,
      link,
    }, row.user_id ?? null);
    sent += 1;
  }
  return { ok: true, day, sent };
}
