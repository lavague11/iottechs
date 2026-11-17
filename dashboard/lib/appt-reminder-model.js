// Pure rules for appointment reminders — no db, no email, importable under bare Node (tests).
//
//  - Two distinct reminders per appointment: "d1" (day-before, goes out once the visit is within 24h AND
//    on the next Eastern calendar day) and "h2" (same-day, ~2h before). Distinct dedupe keys.
//  - The day word ("today" / "tomorrow" / weekday) is COMPUTED from the calendar-day difference in
//    America/New_York at send time — never hardcoded.
//  - A booking made < 24h before the visit never gets the day-before reminder.
//  - No technician → the customer sees PROJECT MANAGER · Ahmed, never "To be assigned".
import { apptDayLabel } from "./send-schedule.js";

export const H = 60 * 60 * 1000;
export const DAY_BEFORE_WINDOW = 24 * H;
export const SAME_DAY_WINDOW = 2 * H;
export const DEFAULT_MANAGER = "Ahmed";

const PLACEHOLDER = /^(to be assigned|tbd|tba|unassigned|n\/a|none|-+)$/i;

// What the "technician" row shows. A real name → Technician; nothing/placeholder → Project Manager.
export function techRow(tech) {
  const t = String(tech || "").trim();
  if (t && !PLACEHOLDER.test(t)) return { label: "Technician", value: t };
  return { label: "PROJECT MANAGER", value: DEFAULT_MANAGER };
}

export function fmt12(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time || "09:00"));
  if (!m) return "";
  const h = +m[1], mi = m[2];
  return `${((h + 11) % 12) + 1}:${mi} ${h >= 12 ? "PM" : "AM"}`;
}

// Day wording for a reminder sent at `now` for `event`. `phrase` reads after "is": "today at 3:00 PM",
// "tomorrow", "on Friday". `short` is the standalone capitalised form for a staff subject prefix.
export function reminderWhen(event, now = new Date()) {
  const { diff, label } = apptDayLabel(event?.date, now);
  const at = fmt12(event?.time);
  const phrase = label === "today" ? `today${at ? ` at ${at}` : ""}` : label === "tomorrow" ? "tomorrow" : label ? `on ${label}` : "soon";
  const short = label === "today" ? `Today${at ? ` ${at}` : ""}` : label === "tomorrow" ? "Tomorrow" : label || "Upcoming";
  return { diff, label, phrase, short };
}

export const BIZ_TZ = "America/New_York";

// Offset (ms) of `tz` from UTC at instant `ms`.
function tzOffsetMs(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// Wall-clock "YYYY-MM-DD" + "HH:MM" in `tz` → the real instant. Independent of process.env.TZ.
export function zonedMs(dateStr, time = "09:00", tz = BIZ_TZ) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  const t = /^(\d{1,2}):(\d{2})/.exec(String(time || "09:00"));
  if (!d || !t) return NaN;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let ms = guess - tzOffsetMs(guess, tz);
  ms = guess - tzOffsetMs(ms, tz);   // second pass settles across a DST edge
  return ms;
}
// Appointment start as an instant, read as an Eastern wall-clock time.
export function apptStartMs(ev) {
  return zonedMs(ev?.date, ev?.time || "09:00");
}

// Booked (or last moved) closer than `windowMs` to the visit? Uses a precise `bookedAt` ISO when present;
// the legacy `created` is date-only, so read it as the START of that Eastern day (the most generous lead)
// — we only skip when the booking was certainly too late. No booking info at all → not skipped.
export function bookedWithin(ev, startMs, windowMs) {
  const raw = ev?.bookedAt || ev?.created;
  if (!raw) return false;
  const s = String(raw);
  const at = /T/.test(s) ? new Date(s).getTime() : zonedMs(s.slice(0, 10), "00:00");
  if (Number.isNaN(at)) return false;
  return startMs - at < windowMs;
}
export const bookedUnder24h = (ev, startMs) => bookedWithin(ev, startMs, DAY_BEFORE_WINDOW);
export const bookedUnder2h = (ev, startMs) => bookedWithin(ev, startMs, SAME_DAY_WINDOW);

// Reminder copy for one send — the single source for the greeting, both subjects and the heading.
export function reminderCopy({ event, noun, accessId = "", now = new Date() }) {
  const w = reminderWhen(event, now);
  return {
    greetCustomer: `A quick reminder — your appointment is ${w.phrase}.`,
    greetStaff: `A reminder — you're on this job ${w.phrase}.`,
    customerSubject: `Reminder: your ${noun} is ${w.phrase}`,
    staffSubject: `${w.short}: you're on a ${noun} (${accessId})`,
    heading: `Reminder — your ${noun} is ${w.phrase}`,
  };
}

// Which reminders are due right now for this event? Returns ["d1"] / ["h2"] / []. Never both at once —
// the day-before only applies while the visit is still on a LATER calendar day.
export function dueReminderKinds(ev, now = Date.now()) {
  if (!ev?.date) return [];
  const t = apptStartMs(ev);
  if (Number.isNaN(t)) return [];
  const diff = t - now;
  if (diff <= 0) return [];
  const { diff: dayDiff } = apptDayLabel(ev.date, new Date(now));
  if (dayDiff === 1 && diff <= DAY_BEFORE_WINDOW && !bookedUnder24h(ev, t)) return ["d1"];
  if (dayDiff === 0 && diff <= SAME_DAY_WINDOW && !bookedUnder2h(ev, t)) return ["h2"];
  return [];
}

// Dedupe key. Includes date+time so a RESCHEDULE (same id) re-arms; includes the kind so the same-day
// reminder is not swallowed by the day-before.
export function reminderKey(accessId, ev, kind) {
  return `${accessId}:${ev.id ?? ""}:${ev.date}T${ev.time || ""}:${kind}`;
}
// Pre-existing rows used `${accessId}:${ev.id || date+time}` for the one 24h reminder.
export function legacyReminderKey(accessId, ev) {
  return `${accessId}:${ev.id || `${ev.date}${ev.time || ""}`}`;
}

// Did the send fail outright (so the claim must be handed back for a retry)? Any ok:false — no-project,
// no-event, exception — or recipients present but none reached. A partial success keeps the claim.
export function shouldReleaseClaim(res) {
  return !res || res.ok === false || (res.recipients > 0 && res.sent === 0);
}
