// Section J — appointment reminders: computed day label (fixed clock, America/New_York), distinct
// day-before / same-day windows + keys, <24h bookings skip the day-before, no "To be assigned" to customers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apptDayLabel } from "../lib/send-schedule.js";
import { reminderWhen, reminderCopy, techRow, dueReminderKinds, reminderKey, legacyReminderKey, fmt12, zonedMs, shouldReleaseClaim, bookedUnder24h } from "../lib/appt-reminder-model.js";

// Fixed instants. EST = UTC-5 (Nov), EDT = UTC-4 (Jul).
const at = (iso) => new Date(iso);

test("day label: same day / next day / two days out / month boundary (Eastern)", () => {
  const now = at("2026-03-10T15:00:00Z"); // 11:00 AM EDT
  assert.equal(apptDayLabel("2026-03-10", now).label, "today");
  assert.equal(apptDayLabel("2026-03-11", now).label, "tomorrow");
  assert.equal(apptDayLabel("2026-03-12", now).label, "Thursday");
  const eom = at("2026-03-31T16:00:00Z");
  assert.equal(apptDayLabel("2026-04-01", eom).label, "tomorrow");
  assert.equal(apptDayLabel("2026-04-02", eom).label, "Thursday");
  const ny = at("2026-12-31T20:00:00Z");
  assert.equal(apptDayLabel("2027-01-01", ny).label, "tomorrow");
});

test("day label uses the Eastern calendar day, not UTC", () => {
  // 11:30 PM EST Nov 15 is already Nov 16 in UTC — it is still "today" for Nov 15 in New York.
  const now = at("2026-11-16T04:30:00Z");
  assert.equal(apptDayLabel("2026-11-15", now).label, "today");
  assert.equal(apptDayLabel("2026-11-16", now).label, "tomorrow");
});

test("reminderWhen wording: today carries the time, tomorrow/weekday do not", () => {
  const now = at("2026-03-10T15:00:00Z");
  assert.equal(reminderWhen({ date: "2026-03-10", time: "15:00" }, now).phrase, "today at 3:00 PM");
  assert.equal(reminderWhen({ date: "2026-03-11", time: "15:00" }, now).phrase, "tomorrow");
  assert.equal(reminderWhen({ date: "2026-03-12", time: "09:00" }, now).phrase, "on Thursday");
  assert.equal(reminderWhen({ date: "2026-03-11" }, now).short, "Tomorrow");
  assert.equal(fmt12("00:05"), "12:05 AM");
  assert.equal(fmt12("12:00"), "12:00 PM");
});

test("day-before fires within 24h on the next calendar day; same-day only inside ~2h; never both", () => {
  const ev = { id: "e1", date: "2026-03-11", time: "15:00" };
  assert.deepEqual(dueReminderKinds(ev, at("2026-03-10T17:00:00Z").getTime()), []);             // 25h out (1 PM EDT)... not yet
  assert.deepEqual(dueReminderKinds(ev, at("2026-03-10T20:00:00Z").getTime()), ["d1"]);         // 4 PM EDT, 23h out
  const today = { id: "e2", date: "2026-03-10", time: "15:00" };
  assert.deepEqual(dueReminderKinds(today, at("2026-03-10T15:00:00Z").getTime()), []);          // 11 AM, 4h out, today → nothing
  assert.deepEqual(dueReminderKinds(today, at("2026-03-10T17:30:00Z").getTime()), ["h2"]);      // 1:30 PM, 1.5h out
  assert.deepEqual(dueReminderKinds(today, at("2026-03-10T19:30:00Z").getTime()), []);          // past
});

test("a booking made under 24h out skips the day-before", () => {
  const now = at("2026-03-10T20:00:00Z").getTime(); // 4 PM EDT Mar 10
  const fresh = { id: "e3", date: "2026-03-11", time: "15:00", bookedAt: "2026-03-10T20:00:00Z" }; // booked 4 PM, 23h lead
  assert.deepEqual(dueReminderKinds(fresh, now), []);
  const early = { ...fresh, bookedAt: "2026-03-08T19:00:00Z" };
  assert.deepEqual(dueReminderKinds(early, now), ["d1"]);
  // same-day booking (date-only legacy `created`) for the same day never gets a day-before either
  const sameDay = { id: "e4", date: "2026-03-10", time: "21:00", created: "2026-03-10" };
  assert.deepEqual(dueReminderKinds(sameDay, now), []);                       // 5h out, today: neither window open
  assert.deepEqual(dueReminderKinds(sameDay, at("2026-03-11T00:30:00Z").getTime()), ["h2"]);  // 8:30 PM EDT, 30m out, booked earlier today (date-only)
  // no booking info → not skipped
  assert.deepEqual(dueReminderKinds({ id: "e5", date: "2026-03-11", time: "15:00" }, now), ["d1"]);
});

test("dedupe keys: day-before and same-day are distinct; a reschedule re-arms", () => {
  const ev = { id: "e1", date: "2026-03-11", time: "15:00" };
  assert.notEqual(reminderKey("P1", ev, "d1"), reminderKey("P1", ev, "h2"));
  assert.notEqual(reminderKey("P1", ev, "d1"), reminderKey("P1", { ...ev, date: "2026-03-12" }, "d1"));
  assert.notEqual(reminderKey("P1", ev, "d1"), reminderKey("P1", { ...ev, time: "16:00" }, "d1"));
  assert.equal(legacyReminderKey("P1", ev), "P1:e1");
});

test("no technician → PROJECT MANAGER · Ahmed; a real tech keeps the Technician row", () => {
  for (const v of ["", null, undefined, "  ", "To be assigned", "TBD", "Unassigned"]) {
    assert.deepEqual(techRow(v), { label: "PROJECT MANAGER", value: "Ahmed" }, String(v));
  }
  assert.deepEqual(techRow("Sam Rivera"), { label: "Technician", value: "Sam Rivera" });
});

test('"To be assigned" can never reach a customer render', () => {
  const email = readFileSync(new URL("../lib/email.js", import.meta.url), "utf8");
  assert.ok(!/to be assigned/i.test(email), "email.js has no placeholder string");
  assert.ok(email.includes("techRow(tech)") && email.includes("${esc(tr.label)}") && email.includes("${esc(tr.value)}"), "tech row comes from techRow");
});

test("the reported bug: a 1:25 PM send for a 3:00 PM same-day visit says today at 3:00 PM everywhere, never tomorrow", () => {
  const now = at("2026-03-10T17:25:00Z"); // 1:25 PM EDT
  const event = { id: "e1", date: "2026-03-10", time: "15:00" };
  const c = reminderCopy({ event, noun: "site survey", accessId: "ASC0036", now });
  for (const k of ["greetCustomer", "greetStaff", "customerSubject", "staffSubject", "heading"]) {
    assert.ok(c[k].includes("3:00 PM"), `${k}: ${c[k]}`);
    assert.ok(!/tomorrow/i.test(c[k]), `${k} must not say tomorrow: ${c[k]}`);
  }
  assert.equal(c.customerSubject, "Reminder: your site survey is today at 3:00 PM");
  assert.ok(c.customerSubject.includes("today at 3:00 PM") && c.heading.includes("today at 3:00 PM") && c.greetCustomer.includes("today at 3:00 PM") && c.greetStaff.includes("today at 3:00 PM"));
  assert.equal(c.staffSubject, "Today 3:00 PM: you're on a site survey (ASC0036)");
  // the same event one day earlier reads tomorrow; two days earlier names the weekday
  assert.ok(reminderCopy({ event, noun: "x", now: at("2026-03-09T17:25:00Z") }).customerSubject.endsWith("is tomorrow"));
  assert.ok(reminderCopy({ event, noun: "x", now: at("2026-03-08T17:25:00Z") }).customerSubject.endsWith("is on Tuesday"));
});

test("email.js takes every reminder string from reminderCopy (no inline day wording)", () => {
  const email = readFileSync(new URL("../lib/email.js", import.meta.url), "utf8");
  assert.ok((email.match(/reminderCopy\(/g) || []).length >= 4, "greeting + both subjects + heading");
  assert.ok(!/tomorrow/i.test(email.replace("Make tomorrow safer today", "")), "no 'tomorrow' literal left in email.js");
});

test("explicit zone: results do not depend on process TZ, across the DST edges", () => {
  // Mar 8 2026 (spring forward): 3:00 AM EDT = 07:00Z; 1:00 AM EST = 06:00Z. Nov 1 2026 (fall back): 1:30 AM EDT = 05:30Z.
  assert.equal(zonedMs("2026-03-08", "03:00"), Date.UTC(2026, 2, 8, 7, 0));
  assert.equal(zonedMs("2026-03-08", "01:00"), Date.UTC(2026, 2, 8, 6, 0));
  assert.equal(zonedMs("2026-11-01", "12:00"), Date.UTC(2026, 10, 1, 17, 0));   // EST after the fall-back
  assert.equal(zonedMs("2026-07-04", "09:00"), Date.UTC(2026, 6, 4, 13, 0));
  assert.ok(Number.isNaN(zonedMs("nope", "09:00")));
  // a real DST day: visit 9:00 AM Mar 9 (EDT), sweep at 9:30 AM EST Mar 8 (14:30Z) is only 22.5h away → day-before due
  assert.deepEqual(dueReminderKinds({ id: "d", date: "2026-03-09", time: "09:00" }, Date.UTC(2026, 2, 8, 14, 30)), ["d1"]);
  // 25h earlier on the wall clock but 24h real → still not <=24h until the edge: 8:30 AM EST Mar 8 → 23.0h real? (13:30Z → 9:00 EDT Mar 9 = 13:00Z next day = 23.5h)
  assert.deepEqual(dueReminderKinds({ id: "d", date: "2026-03-09", time: "09:00" }, Date.UTC(2026, 2, 8, 12, 30)), []);   // 7:30 AM EST (wall 25.5h, real 24.5h)
});

test("a same-day booking moments before the visit gets no h2; a reschedule re-stamp suppresses the day-before", () => {
  const now = at("2026-03-10T17:45:00Z").getTime(); // 1:45 PM EDT
  const justBooked = { id: "s", date: "2026-03-10", time: "15:00", bookedAt: "2026-03-10T17:25:00Z" }; // 1:25 PM → 95 min lead
  assert.deepEqual(dueReminderKinds(justBooked, now), []);
  assert.deepEqual(dueReminderKinds({ ...justBooked, bookedAt: "2026-03-09T12:00:00Z" }, now), ["h2"]);
  // moved to tomorrow 3 PM and re-stamped at 4 PM today → <24h lead → no day-before
  const moved = { id: "m", date: "2026-03-11", time: "15:00", bookedAt: "2026-03-10T20:00:00Z" };
  assert.deepEqual(dueReminderKinds(moved, at("2026-03-10T20:30:00Z").getTime()), []);
  const widget = readFileSync(new URL("../app/project/[accessId]/scheduling-widget.jsx", import.meta.url), "utf8");
  assert.ok(widget.includes("const moved = existing.date !== form.date") && widget.includes("Object.assign(e, form, stamp)"), "editing a date/time re-stamps bookedAt");
});

test("created-only legacy events: date-only stamp reads as start of that Eastern day", () => {
  const start = zonedMs("2026-03-11", "03:00");
  assert.equal(bookedUnder24h({ created: "2026-03-10" }, start), false);   // 3 AM Mar 11 − 00:00 Mar 10 = 27h → not under
  assert.equal(bookedUnder24h({ created: "2026-03-11" }, start), true);    // same-day booking → under
  assert.equal(bookedUnder24h({ created: "2026-03-09" }, start), false);
});

test("claim/release: any ok:false or all-failed releases the claim; partial success and skips keep it", () => {
  assert.equal(shouldReleaseClaim(null), true);
  assert.equal(shouldReleaseClaim({ ok: false, error: "no-project" }), true);
  assert.equal(shouldReleaseClaim({ ok: false, error: "no-event" }), true);
  assert.equal(shouldReleaseClaim({ ok: false, error: "exception" }), true);
  assert.equal(shouldReleaseClaim({ ok: true, sent: 0, recipients: 3 }), true);
  assert.equal(shouldReleaseClaim({ ok: true, sent: 2, recipients: 3 }), false);
  assert.equal(shouldReleaseClaim({ ok: true, skipped: "demo-project", sent: 0 }), false);
});

test("sweep: failed sends release the claim; keys come from the model", () => {
  const sweep = readFileSync(new URL("../lib/appointment-reminders.js", import.meta.url), "utf8");
  assert.ok(sweep.includes("releaseAppointmentReminder(key)") && sweep.includes("dueReminderKinds(ev, now)") && sweep.includes("shouldReleaseClaim(res)"));
  assert.ok(sweep.includes('kind === "d1" && appointmentReminderClaimed(legacyReminderKey('), "legacy-key suppression applies to the day-before only");
  assert.ok(sweep.indexOf("shouldReleaseClaim") < sweep.indexOf("sent++"), "release check runs before the success count / Job Log");
  assert.ok(sweep.includes("reminderKey(row.project_access_id, ev, kind)"));
});
