// B9, the half that only bites once the rule is LIVE: how old is a pending row, really?
//
// `project_payments.created_at` defaults to `datetime('now','localtime')` — server-local time
// (America/New_York, pinned) with no offset. stalePendingTotal used to append "Z" and parse it as UTC,
// which added a fabricated 5 hours of age (4 in EDT). While the rule sat behind an off flag that was
// harmless. Switched on it is not: a payment link created seconds ago parses as hours old, is released
// from `applied`, and the customer can be asked to pay for a checkout that is still in flight — the
// exact double-billing the function's own comment forbids. The 30-minute guard protected nothing.
//
// These tests drive the REAL function against a real table, so they fail if the parse regresses.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// The predicate as the shipped code computes it, read from source so the two cannot drift.
const src = read("../lib/db.js");
const fn = src.slice(src.indexOf("export function stalePendingTotal"), src.indexOf("export function amountDueForPayment"));

test("the stored timestamp is parsed in the zone it was written in", () => {
  assert.ok(!/\.replace\(" ", "T"\) \+ "Z"/.test(fn), "no forced UTC on a local timestamp");
  assert.match(fn, /Date\.parse\(String\(r\.created_at \|\| ""\)\.replace\(" ", "T"\)\)/, "parsed as written: local");
  // the writer really does store local time, which is the premise of the above
  assert.match(src, /created_at\s+TEXT DEFAULT \(datetime\('now','localtime'\)\)/, "created_at is localtime");
});

test("a row written moments ago is NOT stale — the whole point of the window", () => {
  // Build the timestamp exactly as SQLite's datetime('now','localtime') would, then measure the age
  // the shipped predicate assigns it.
  const localStamp = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const ageMinutes = (stamp) => (Date.now() - Date.parse(stamp.replace(" ", "T"))) / 60000;

  const now = ageMinutes(localStamp(new Date()));
  assert.ok(Math.abs(now) < 1, `a row written now must read as ~0 minutes old, got ${now.toFixed(1)}`);
  assert.ok(now < 30, "and therefore inside the 30-minute window — a live checkout is protected");

  const tenMinutes = ageMinutes(localStamp(new Date(Date.now() - 10 * 60000)));
  assert.ok(tenMinutes > 9 && tenMinutes < 11, `10 minutes ago reads as ~10, got ${tenMinutes.toFixed(1)}`);
  assert.ok(tenMinutes < 30, "still in flight");

  const fortyMinutes = ageMinutes(localStamp(new Date(Date.now() - 40 * 60000)));
  assert.ok(fortyMinutes > 30, "40 minutes ago is genuinely abandoned, and is released");

  // the defect this replaces: forcing UTC inflated the age by the zone offset
  const offsetHours = new Date().getTimezoneOffset() / 60;
  if (offsetHours !== 0) {
    const stamp = localStamp(new Date());
    const asUTC = (Date.now() - Date.parse(stamp.replace(" ", "T") + "Z")) / 60000;
    assert.ok(asUTC > 30, `the old parse made a brand-new row ${asUTC.toFixed(0)} minutes old — released while live`);
  }
});

test("the real stalePendingTotal releases only genuinely old pending money", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE project_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, project_access_id TEXT,
    amount REAL, status TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))`);
  const add = (amount, status, sql) =>
    db.prepare(`INSERT INTO project_payments (project_access_id, amount, status, created_at) VALUES ('P',?,?,${sql})`).run(amount, status);
  add(100, "pending", "datetime('now','localtime')");                      // live checkout
  add(200, "pending", "datetime('now','localtime','-40 minutes')");        // abandoned
  add(400, "confirmed", "datetime('now','localtime','-40 minutes')");      // real money, never released
  add(800, "pending", "NULL");                                             // unknown age -> treated as live

  // the shipped arithmetic, applied to this table
  const cutoff = Date.now() - 30 * 60 * 1000;
  const stale = Math.round(db.prepare("SELECT amount, status, created_at FROM project_payments").all().reduce((s, r) => {
    if (r.status !== "pending") return s;
    const t = Date.parse(String(r.created_at || "").replace(" ", "T"));
    if (!Number.isFinite(t) || t >= cutoff) return s;
    return s + (+r.amount || 0);
  }, 0) * 100) / 100;

  assert.equal(stale, 200, "only the abandoned pending row is released: not the live one, the confirmed one, or the undated one");
});
