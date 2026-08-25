// 24-hour appointment reminders. A boot scheduler (instrumentation.js) runs this sweep on a timer;
// it finds every booked appointment happening within the next 24 hours and emails the customer +
// assigned team (+ any guest emails on the event) a reminder — exactly once per appointment.
//
// Times are floating local (server TZ = America/New_York), so `new Date("YYYY-MM-DDTHH:MM")` parses
// in the office's timezone, matching how the appointment was booked.

import { allScheduleBlobs, claimAppointmentReminder, logProjectEvent } from "./db.js";
import { sendAppointmentEmails } from "./email.js";

const H24 = 24 * 60 * 60 * 1000;
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

export async function sendDueAppointmentReminders() {
  let rows = [];
  try { rows = allScheduleBlobs(); } catch { return { ok: false, error: "db" }; }
  const now = Date.now();
  let sent = 0, scanned = 0;

  for (const row of rows) {
    let data; try { data = JSON.parse(row.data || "{}"); } catch { continue; }
    const events = Array.isArray(data?.events) ? data.events : [];
    for (const ev of events) {
      if (!ev?.date) continue;
      scanned++;
      const t = new Date(`${ev.date}T${ev.time || "09:00"}`).getTime();
      if (Number.isNaN(t)) continue;
      const diff = t - now;
      if (diff <= 0 || diff > H24) continue;                 // only visits in the next 24h

      const key = `${row.project_access_id}:${ev.id || `${ev.date}${ev.time || ""}`}`;
      let claimed = false;
      try { claimed = claimAppointmentReminder(key); } catch { continue; }
      if (!claimed) continue;                                 // already reminded

      const guests = (ev.invitees || []).filter(isEmail);     // typed guest invitees
      try {
        await sendAppointmentEmails(row.project_access_id, { verb: "reminder", event: ev, extraEmails: guests });
        sent++;
        try { logProjectEvent(row.project_access_id, { kind: "schedule", label: `24h reminder sent · ${ev.title || "Appointment"}`.slice(0, 300), actor: "System" }); } catch {}
      } catch { /* best-effort; the claim stands so we don't spam retries */ }
    }
  }
  return { ok: true, sent, scanned };
}
