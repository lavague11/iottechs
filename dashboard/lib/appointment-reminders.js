// Appointment reminders. A boot scheduler (instrumentation.js) runs this sweep every 30 min. Two
// distinct reminders per appointment (rules in lib/appt-reminder-model.js): the day-before ("d1"), and an
// optional same-day one ~2h out ("h2"). Each emails the customer + assigned team (+ guest emails).
//
// Stored times are floating wall-clock strings, read explicitly as America/New_York by the model
// (never via the process timezone).

import { allScheduleBlobs, claimAppointmentReminder, releaseAppointmentReminder, appointmentReminderClaimed, logProjectEvent } from "./db.js";
import { sendAppointmentEmails } from "./email.js";
import { dueReminderKinds, reminderKey, legacyReminderKey, shouldReleaseClaim } from "./appt-reminder-model.js";

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
      for (const kind of dueReminderKinds(ev, now)) {
        const key = reminderKey(row.project_access_id, ev, kind);
        try { if (kind === "d1" && appointmentReminderClaimed(legacyReminderKey(row.project_access_id, ev))) continue; } catch {}
        let claimed = false;
        try { claimed = claimAppointmentReminder(key); } catch { continue; }
        if (!claimed) continue;                               // already reminded

        const guests = (ev.invitees || []).filter(isEmail);   // typed guest invitees
        let res = null;
        try { res = await sendAppointmentEmails(row.project_access_id, { verb: "reminder", event: ev, extraEmails: guests }); } catch { res = { ok: false, error: "exception" }; }
        // A failed send gives the claim back so the next sweep retries; a partial success keeps it
        // (releasing would re-mail the recipients who already got it).
        const failed = shouldReleaseClaim(res);
        if (failed) { try { releaseAppointmentReminder(key); } catch {} continue; }
        sent++;
        try { logProjectEvent(row.project_access_id, { kind: "schedule", label: `${kind === "h2" ? "Same-day" : "Day-before"} reminder sent · ${ev.title || "Appointment"}`.slice(0, 300), actor: "System" }); } catch {}
      }
    }
  }
  return { ok: true, sent, scanned };
}
