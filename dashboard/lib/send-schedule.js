// Shared send-time scheduling for staff → customer approval emails (signature requests + add-on approvals).
// ONE rule everywhere: the default send time is the NEXT 8:30 AM, and we nudge toward scheduling when it's
// "late" for the recipient — after 7 PM or before 8 AM. The picker shows the viewer's local wall clock (the
// business runs on Eastern, so viewer-local = 8:30 ET in practice); the LATE check is evaluated in the
// customer's timezone when known, otherwise Eastern, so a customer email never fires at an antisocial hour.
// Pure + dependency-free so both client components and the server sweep can import it.

const BIZ_TZ = "America/New_York";
const pad = (n) => String(n).padStart(2, "0");

// datetime-local string ("YYYY-MM-DDTHH:MM") for a Date, in the viewer's local tz.
export const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Next occurrence of H:M in the viewer's local tz — today if it's still ahead, otherwise tomorrow.
export function nextLocalAt(hour, minute, now = new Date()) {
  const d = new Date(now); d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}
// Tomorrow at H:M (viewer-local) — for the "Tomorrow …" quick picks.
export function tomorrowLocalAt(hour, minute, now = new Date()) {
  const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(hour, minute, 0, 0);
  return d;
}
export const next830 = (now = new Date()) => nextLocalAt(8, 30, now);

// Hour (0–23) as read in a timezone — for the late-hour check.
export function hourInTz(tz = BIZ_TZ, now = new Date()) {
  try {
    const h = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
    return isNaN(h) ? now.getHours() : (h === 24 ? 0 : h);
  } catch { return now.getHours(); }
}
// "Late" for a recipient: after 7 PM or before 8 AM in their tz (customer tz if known, else Eastern).
export function isLateFor(tz, now = new Date()) {
  const h = hourInTz(tz || BIZ_TZ, now);
  return h >= 19 || h < 8;
}

// A friendly label for a chosen send time, relative to now: "8:30 AM tomorrow", "8:30 AM today",
// or "8:30 AM on Fri, Nov 8" for anything further out. `d` may be a Date or a datetime-local string.
export function friendlyWhen(d, now = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(dt).setHours(0, 0, 0, 0) - day0.getTime()) / 86400000);
  if (diff === 0) return `${time} today`;
  if (diff === 1) return `${time} tomorrow`;
  return `${time} on ${dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
}

// Calendar-day comparison in the business timezone — NEVER a millisecond window. `dateStr` is the
// appointment's floating local "YYYY-MM-DD"; `now` is a real instant, read as an Eastern calendar day.
// Returns { diff, label }: diff 0 → "today", 1 → "tomorrow", anything else → the weekday name.
export function ymdInTz(now = new Date(), tz = BIZ_TZ) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return toLocalInput(now).slice(0, 10); }
}
export function apptDayLabel(dateStr, now = new Date(), tz = BIZ_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return { diff: NaN, label: "" };
  const n = ymdInTz(now, tz).split("-").map(Number);
  const diff = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(n[0], n[1] - 1, n[2])) / 86400000);
  if (diff === 0) return { diff, label: "today" };
  if (diff === 1) return { diff, label: "tomorrow" };
  const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return { diff, label: wd };
}

// Everything a scheduler UI needs up front: whether it's late, and the default (next 8:30) as both a
// datetime-local string (for the input) and an ISO instant (for storage).
export function scheduleDefaults({ tz = BIZ_TZ, now = new Date() } = {}) {
  const def = next830(now);
  return { late: isLateFor(tz, now), defaultLocal: toLocalInput(def), defaultISO: def.toISOString() };
}
