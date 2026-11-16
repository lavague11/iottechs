// The ONE validator for a project's completion date. Pure, dependency-free, so the DB layer (the
// admin override) and the legacy migration can both use it without either importing the other.
//
// Why it exists: `db.markProjectCompleted(accessId, date)` only honours a date matching
// /^\d{4}-\d{2}-\d{2}/ and silently falls back to `datetime('now','localtime')` for anything else.
// completed_at + warranty_months IS the warranty, so a date that fails to parse doesn't produce an
// error — it produces a warranty that starts today on a job that finished months ago. Nothing may
// reach that write without passing through here.
//
// This is a CALENDAR check, not a shape check: "2026-13-45", "2026-02-30", "0000-00-00" and
// "9999-99-99" all match the shape and are all rejected, because a shape check would let
// markProjectCompleted store a date SQLite cannot compare and a human cannot read.
export function isStampableCompletionDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(String(v ?? ""));
  if (!m) return false;                                   // wrong shape, or trailing junk ("2026-01-01extra")
  const [, y, mo, d] = m.map(Number);
  if (y < 2000 || y > 2100) return false;                 // outside any plausible project history
  const dt = new Date(Date.UTC(y, mo - 1, d));            // round-trip: catches 02-30, 13-45, 00-00
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// The date as the database will store it (markProjectCompleted keeps the day, drops the time).
export const completionDay = (v) => String(v ?? "").slice(0, 10);
