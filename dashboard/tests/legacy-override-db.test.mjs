// Section O — the ADMIN manual override, driven against a REAL database.
//
// The companion tests in legacy-migration.test.mjs assert on source text; these actually run
// db.setLegacyStageOverride and read the rows back, because this is an admin writing stage and
// completion onto live projects and "the string is present" is not evidence that it works.
//
// Every write lands in a THROWAWAY DB_DIR (a fresh database that lib/db.js creates and seeds on
// first query) on a THROWAWAY project id. dashboard/data is never opened: DB_DIR is set before
// lib/db.js is imported, and the import is dynamic so that ordering is guaranteed.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { can } from "../lib/roles.js";

const DIR = mkdtempSync(path.join(tmpdir(), "iot-legacy-override-"));
process.env.DB_DIR = DIR;
const db = await import("../lib/db.js");

// Guard the guard: if DB_DIR were ignored, this file would be writing to the real database.
assert.equal(path.resolve(db.dbDir()), path.resolve(DIR), "tests must run against the throwaway DB_DIR");
assert.ok(!existsSync(path.join(process.cwd(), "data", "dashboard.db")) || path.resolve(db.dbDir()) !== path.resolve(process.cwd(), "data"));

const ID = "ZZZ0001";
const h = db.sqliteHandle();
h.prepare(`INSERT INTO projects (access_id,customer,address,service_code,project_type,category,stage,status)
           VALUES (?,?,?,?,?,?,?,?)`).run(ID, "Throwaway Override Co", "1 Test St", "SC", "A", "open", "inquiry", "New");

// Local today, the same way lib/db.completionEvidenceDate computes it (the server is pinned to
// America/New_York, so a UTC date would be a day off for five hours every evening).
const TODAY = new Date().toLocaleDateString("en-CA");

const row = () => db.getJobByAccessId(ID);
const transitions = () => h.prepare("SELECT stage, by_name FROM stage_transitions WHERE project_access_id=? ORDER BY id").all(ID);
const overrides = () => db.getProjectEvents(ID).filter((e) => e.kind === "override");

test("override moves the stage, records the transition with the actor, and logs the override", () => {
  assert.equal(row().stage, "inquiry");
  const res = db.setLegacyStageOverride(ID, { stage: "schedule", reason: "legacy job, install was booked by phone", by: "Ahmed (admin)" });
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.equal(row().stage, "schedule");

  const t = transitions();
  assert.equal(t.at(-1).stage, "schedule");
  assert.equal(t.at(-1).by_name, "Ahmed (admin)", "the human who overrode it is on the transition row");

  const ev = overrides();
  assert.equal(ev.length, 1);
  assert.match(ev[0].label, /Admin override \(legacy project\)/);
  assert.match(ev[0].label, /Inquiry → Fulfillment/);
  assert.match(ev[0].label, /legacy job, install was booked by phone/);
  assert.equal(ev[0].actor, "Ahmed (admin)");
});

test("completed:true stamps THE DATE GIVEN — never today — and logs which day was used", () => {
  assert.equal(row().completed_at, null);
  const set = db.setLegacyStageOverride(ID, { stage: "completion", completed: true, completedAt: "2026-07-20", reason: "finished in July", by: "Ahmed (admin)" });
  assert.equal(set.ok, true);
  assert.equal(set.stampChanged, "set");
  assert.match(row().completed_at, /^2026-07-20/, "the stamp is the date the job finished, not the day of the override");
  assert.ok(!row().completed_at.startsWith(TODAY), `the stamp must not be today (${TODAY})`);
  assert.match(overrides()[0].label, /marked complete as of 2026-07-20/);
  db.setLegacyStageOverride(ID, { stage: "completion", completed: false, by: "admin" });   // reset for the next test
});

test("completed:true with no date and no dated evidence is REFUSED, and writes nothing", () => {
  assert.equal(row().completed_at, null);
  const stage = row().stage, events = overrides().length;
  const res = db.setLegacyStageOverride(ID, { stage: "payment", completed: true, by: "admin" });
  assert.equal(res.ok, false);
  assert.match(res.error, /needs a completion date/);
  assert.equal(row().completed_at, null, "no stamp");
  assert.equal(row().stage, stage, "and the stage move did not happen either — a bad date changes nothing");
  assert.equal(overrides().length, events, "nothing logged");
});

test("an impossible or malformed date is refused before anything is written", () => {
  for (const bad of ["2026-13-45", "2026-02-30", "09/20/2026", "last July", "0000-00-00"]) {
    const res = db.setLegacyStageOverride(ID, { stage: "completion", completed: true, completedAt: bad, by: "admin" });
    assert.equal(res.ok, false, `refused: ${bad}`);
    assert.match(res.error, /not a real YYYY-MM-DD date/);
    assert.equal(row().completed_at, null, `nothing stamped for ${bad}`);
  }
});

test("with no date supplied, the stamp falls back to DATED EVIDENCE on the row", () => {
  // A confirmed payment from July is the only dated thing on this project.
  h.prepare("INSERT INTO project_payments (project_access_id, amount, status, paid_at) VALUES (?,?,?,?)")
    .run(ID, 500, "confirmed", "2026-07-02");
  const ev = db.completionEvidenceDate(ID);
  assert.equal(ev.date, "2026-07-02");
  assert.match(ev.source, /last confirmed payment/);
  const res = db.setLegacyStageOverride(ID, { stage: "completion", completed: true, by: "admin" });
  assert.equal(res.ok, true);
  assert.match(row().completed_at, /^2026-07-02/, "derived from the payment, not from today");
  db.setLegacyStageOverride(ID, { stage: "completion", completed: false, by: "admin" });   // reset
  h.prepare("DELETE FROM project_payments WHERE project_access_id=?").run(ID);
});

// THE SELF-CONFIRMING-DATE GUARD. Moving a project to Completion writes a stage_transitions row
// stamped NOW, by the admin's own name — so without the today-skip in completionEvidenceDate, an
// admin who moves the stage and then marks the job complete "derives" the completion date from the
// row they just created. That date is the warranty start. These two tests are the net: delete the
// `DATE(entered_at) <> DATE('now','localtime')` clause (or its payment twin) and they fail.
test("a completion transition dated TODAY is not evidence — the same row back-dated is", () => {
  const ins = (at, by = "Ahmed (admin)") => h.prepare("INSERT INTO stage_transitions (project_access_id, stage, by_name, entered_at) VALUES (?,?,?,?)").run(ID, "completion", by, at);
  const wipe = () => h.prepare("DELETE FROM stage_transitions WHERE project_access_id=? AND stage='completion'").run(ID);

  wipe();
  ins(`${TODAY} 09:30:00`);                       // exactly what an admin's own stage move leaves behind
  assert.equal(db.completionEvidenceDate(ID).date, null, "today's transition must not become the warranty start");
  // …and the override therefore refuses instead of silently stamping today.
  const refused = db.setLegacyStageOverride(ID, { stage: "completion", completed: true, by: "Ahmed (admin)" });
  assert.equal(refused.ok, false, "no date, no usable evidence → refused");
  assert.match(refused.error, /needs a completion date/);
  assert.equal(row().completed_at, null, "nothing stamped");

  wipe();
  ins("2026-08-09 10:00:00");                     // the same row, back-dated: now it IS evidence
  const ev = db.completionEvidenceDate(ID);
  assert.equal(ev.date, "2026-08-09 10:00:00", "a past human-recorded completion is used");
  assert.match(ev.source, /human-recorded/);
  wipe();
});

test("a confirmed payment dated TODAY is not evidence — the same payment back-dated is", () => {
  const pay = (at) => h.prepare("INSERT INTO project_payments (project_access_id, amount, status, paid_at) VALUES (?,?,?,?)").run(ID, 250, "confirmed", at);
  const wipe = () => h.prepare("DELETE FROM project_payments WHERE project_access_id=?").run(ID);

  wipe();
  pay(TODAY);
  assert.equal(db.completionEvidenceDate(ID).date, null, "a payment taken today does not date a job that finished earlier");
  const refused = db.setLegacyStageOverride(ID, { stage: "completion", completed: true, by: "admin" });
  assert.equal(refused.ok, false, "refused rather than stamped with today");
  assert.equal(row().completed_at, null, "nothing stamped");

  wipe();
  pay("2026-06-11");
  assert.equal(db.completionEvidenceDate(ID).date, "2026-06-11", "a past confirmed payment is used");
  wipe();
});

test("a backfill-authored completion transition is not accepted as dated evidence", () => {
  h.prepare("INSERT INTO stage_transitions (project_access_id, stage, by_name, entered_at) VALUES (?,?,?,?)")
    .run(ID, "completion", "backfill", "2026-01-01 00:00:00");
  assert.equal(db.completionEvidenceDate(ID).date, null, "a script's timestamp is not when the work finished");
  h.prepare("INSERT INTO stage_transitions (project_access_id, stage, by_name, entered_at) VALUES (?,?,?,?)")
    .run(ID, "completion", "Ahmed (admin)", "2026-08-09 10:00:00");
  const ev = db.completionEvidenceDate(ID);
  assert.equal(ev.date, "2026-08-09 10:00:00");
  assert.match(ev.source, /human-recorded/);
  h.prepare("DELETE FROM stage_transitions WHERE project_access_id=? AND stage='completion'").run(ID);
});

test("completed:false clears the stamp, and both directions are logged", () => {
  db.setLegacyStageOverride(ID, { stage: "completion", completed: true, completedAt: "2026-07-20", by: "Ahmed (admin)" });
  assert.ok(row().completed_at, "completed_at written");
  assert.match(overrides()[0].label, /marked complete/);

  const clear = db.setLegacyStageOverride(ID, { stage: "completion", completed: false, reason: "wrong project", by: "Ahmed (admin)" });
  assert.equal(clear.ok, true);
  assert.equal(clear.changed, true);
  assert.equal(clear.stampChanged, "cleared");
  assert.equal(row().completed_at, null, "the stamp is really cleared — reopenProjectCompletion ran");
  assert.match(overrides()[0].label, /completion stamp cleared/);
});

test("completed:null leaves the stamp alone, and a no-op override writes no event", () => {
  db.setLegacyStageOverride(ID, { stage: "completion", completed: true, completedAt: "2026-07-20", by: "admin" });
  const before = overrides().length;
  const res = db.setLegacyStageOverride(ID, { stage: "completion", completed: null, by: "admin" });
  assert.equal(res.changed, false, "same stage, no stamp change → nothing happened");
  assert.ok(row().completed_at, "the existing stamp is untouched");
  assert.equal(overrides().length, before, "a no-op is not logged");
  db.setLegacyStageOverride(ID, { stage: "completion", completed: false, by: "admin" });   // reset
});

test("an invalid or inapplicable stage is refused and changes nothing", () => {
  const stage = row().stage, events = overrides().length;
  for (const bad of ["nope", "", null, undefined, "qualified", "deposit"]) {
    const res = db.setLegacyStageOverride(ID, { stage: bad, by: "admin" });
    assert.equal(res.ok, false, `refused: ${bad}`);
    assert.match(res.error, /does not apply/);
  }
  assert.equal(row().stage, stage);
  assert.equal(overrides().length, events);
});

test("an unknown project is refused", () => {
  const res = db.setLegacyStageOverride("NOPE9999", { stage: "completion", by: "admin" });
  assert.equal(res.ok, false);
  assert.match(res.error, /not found/);
});

test("the override can move a project BACKWARD — that is the whole point of a human escape hatch", () => {
  db.setLegacyStageOverride(ID, { stage: "completion", by: "admin" });
  const res = db.setLegacyStageOverride(ID, { stage: "site_survey", reason: "stage claimed a proposal that never existed", by: "Ahmed (admin)" });
  assert.equal(res.ok, true);
  assert.equal(row().stage, "site_survey");
  assert.match(overrides()[0].label, /Completion → Site Survey/);
});

// The capability itself: the server action in app/project/[accessId]/legacy-actions.js refuses any
// role for which this is false, so the matrix IS the gate.
test("only admin holds legacy.override — a manager with stage.move is still refused", () => {
  assert.equal(can("admin", "legacy.override"), true);
  for (const r of ["manager", "sales", "tech", "customer", "vendor", "readonly"]) {
    assert.equal(can(r, "legacy.override"), false, r);
  }
  assert.equal(can("manager", "stage.move"), true, "a manager still moves stages the ordinary, gate-checked way");
});

// The REAL gate the server action calls (not a copy): lib/legacy-migration.overrideRefusal.
test("the action's gate refuses non-admins and cross-project PIN grants before any write", async () => {
  const { overrideRefusal } = await import("../lib/legacy-migration.js");
  const stage = row().stage;
  for (const r of ["manager", "sales", "tech", "customer", "vendor", "readonly"]) {
    assert.match(overrideRefusal({ role: r }, ID, can), /Only an admin/, r);
  }
  assert.match(overrideRefusal(null, ID, can), /Only an admin/);
  assert.match(overrideRefusal({ role: "admin", viaPin: true, accessId: "OTHER123" }, ID, can), /Not your project/);
  assert.equal(overrideRefusal({ role: "admin", viaPin: true, accessId: ID }, ID, can), null);
  assert.equal(overrideRefusal({ role: "admin", viaPin: false }, ID, can), null);
  assert.equal(row().stage, stage, "no write happened while testing refusals");
});
