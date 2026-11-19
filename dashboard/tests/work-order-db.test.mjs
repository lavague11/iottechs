// The work order's SQL side (docs/WORK_ORDERS.md), Stage 1. The schema and the statements are LIFTED
// OUT of lib/db.js and executed on an in-memory database, so a rename or a dropped column breaks this
// test instead of silently passing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { workOrderPayloadFrom, woLines } from "../lib/work-order.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const roles = read("../lib/roles.js");

function ddl(name) {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n    \\)`).exec(db);
  assert.ok(m, `${name} DDL found`);
  return m[0];
}
function fnBody(name) {
  const i = db.indexOf(`export function ${name}`);
  assert.ok(i >= 0, `${name} exported`);
  const j = db.indexOf("\nexport ", i + 10);
  return db.slice(i, j < 0 ? undefined : j);
}
const sqlIn = (body) => [...body.matchAll(/db\.prepare\(\s*(["'`])([\s\S]*?)\1\s*\)/g)].map((m) => m[2].trim());

const WO_TABLES = ["wo", "wo_versions", "wo_lines", "wo_signatures", "wo_checkins", "wo_events", "wo_line_media", "wo_day_logs", "wo_line_credits"];
function fresh() {
  const d = new DatabaseSync(":memory:");
  for (const t of WO_TABLES) d.exec(ddl(t));
  d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_project ON wo(project_access_id)");
  return d;
}

const RATES = { cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 12, nvr_setup: 75 };
const PROPOSAL = {
  id: 7, version: 2, selected_option: "A",
  payload: { options: [{ id: "A", name: "Rec", services: [{ key: "camera", label: "Cameras", items: [
    { id: "c1", name: "Front Camera", qty: 1, price: 450, sub: [{ id: "c1a", name: "Cat6 Drop", qty: 1, price: 150 }, { id: "c1b", name: "Mounting", qty: 1, price: 90 }] },
    { id: "n1", name: "NVR (8-Channel)", qty: 1, price: 700 },
  ] }] }] },
};
const seedWo = (d, payload) => {
  d.prepare("INSERT INTO wo (project_access_id, source_proposal_id, source_version, source_option, payload, created_by) VALUES (?,?,?,?,?,?)")
    .run("P1", PROPOSAL.id, PROPOSAL.version, "A", JSON.stringify(payload), "Admin");
  return Number(d.prepare("SELECT id FROM wo WHERE project_access_id='P1'").get().id);
};
// woSyncLines, lifted verbatim in behaviour: upsert each line, tombstone the ones that left.
function syncLines(d, woId, payload) {
  const lines = woLines(payload);
  const ins = d.prepare("INSERT INTO wo_lines (wo_id, line_key, parent_key, needs_photos) VALUES (?,?,?,?) ON CONFLICT(wo_id, line_key) DO UPDATE SET parent_key=excluded.parent_key, needs_photos=excluded.needs_photos, removed_at=NULL");
  for (const l of lines) ins.run(woId, l.key, l.parentKey, l.needsPhotos ? 1 : 0);
  const keys = new Set(lines.map((l) => l.key));
  for (const r of d.prepare("SELECT line_key FROM wo_lines WHERE wo_id=? AND removed_at IS NULL").all(woId)) {
    if (!keys.has(String(r.line_key))) d.prepare("UPDATE wo_lines SET removed_at=datetime('now','localtime') WHERE wo_id=? AND line_key=?").run(woId, r.line_key);
  }
}

test("a project has at most ONE live work order", () => {
  const d = fresh();
  seedWo(d, workOrderPayloadFrom(PROPOSAL, { rates: RATES }));
  assert.throws(() => seedWo(d, workOrderPayloadFrom(PROPOSAL, { rates: RATES })), /UNIQUE|constraint/i);
});

test("creating it writes a line row per line, with the photo requirement set", () => {
  const d = fresh();
  const payload = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const id = seedWo(d, payload);
  syncLines(d, id, payload);
  const rows = d.prepare("SELECT line_key, parent_key, status, needs_photos FROM wo_lines WHERE wo_id=? ORDER BY line_key").all(id);
  assert.deepEqual(rows.map((r) => r.line_key), ["c1", "c1a", "c1b", "n1"]);
  assert.equal(rows.every((r) => r.status === "incomplete"), true, "requirement 17: every line starts Incomplete");
  const byKey = Object.fromEntries(rows.map((r) => [r.line_key, r]));
  assert.equal(byKey.c1a.parent_key, "c1", "a sub-line knows its parent");
  assert.equal(byKey.c1.needs_photos, 1, "a camera demands before/after photos");
  assert.equal(byKey.n1.needs_photos, 1, "so does the recorder");
  assert.equal(byKey.c1b.needs_photos, 0, "a labor line does not");
});

test("requirement 13: a line keeps its status across a revision, and a removed line is tombstoned, not deleted", () => {
  const d = fresh();
  const payload = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const id = seedWo(d, payload);
  syncLines(d, id, payload);
  d.prepare("UPDATE wo_lines SET status='complete', status_by='Tech A', status_at=datetime('now','localtime') WHERE wo_id=? AND line_key='c1'").run(id);

  // A revision: the payout changes and Mounting is dropped.
  const revised = JSON.parse(JSON.stringify(payload));
  revised.options[0].services[0].items[1].techPrice = 120;
  revised.options[0].services[0].items[0].sub = revised.options[0].services[0].items[0].sub.filter((x) => x.id !== "c1b");
  d.prepare("UPDATE wo SET payload=?, updated_at=datetime('now','localtime') WHERE id=?").run(JSON.stringify(revised), id);
  syncLines(d, id, revised);

  const c1 = d.prepare("SELECT status, status_by FROM wo_lines WHERE wo_id=? AND line_key='c1'").get(id);
  assert.equal(c1.status, "complete", "the completed line kept its status");
  assert.equal(c1.status_by, "Tech A", "and who completed it");
  const gone = d.prepare("SELECT removed_at FROM wo_lines WHERE wo_id=? AND line_key='c1b'").get(id);
  assert.ok(gone, "the removed line's row still exists");
  assert.ok(gone.removed_at, "it is tombstoned");
  // It comes back → the same row is revived rather than a second one appearing.
  syncLines(d, id, payload);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_lines WHERE wo_id=? AND line_key='c1b'").get(id).n, 1);
  assert.equal(d.prepare("SELECT removed_at FROM wo_lines WHERE wo_id=? AND line_key='c1b'").get(id).removed_at, null);
});

test("sent versions are immutable rows, one per version", () => {
  const d = fresh();
  const payload = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const id = seedWo(d, payload);
  const ins = d.prepare("INSERT INTO wo_versions (wo_id, version, payload, fingerprint, sent_by) VALUES (?,?,?,?,?)");
  ins.run(id, 1, JSON.stringify(payload), "fp1", "Admin");
  assert.throws(() => ins.run(id, 1, JSON.stringify(payload), "fp1b", "Admin"), /UNIQUE|constraint/i);
  ins.run(id, 2, JSON.stringify(payload), "fp2", "Admin");
  assert.equal(d.prepare("SELECT version FROM wo_versions WHERE wo_id=? ORDER BY version DESC LIMIT 1").get(id).version, 2);
});

test("an offline replay cannot double-log the same tap (requirement 21's idempotence key)", () => {
  const d = fresh();
  const id = seedWo(d, workOrderPayloadFrom(PROPOSAL, { rates: RATES }));
  const ev = d.prepare("INSERT INTO wo_events (wo_id, line_key, action, to_status, actor_name, client_at) VALUES (?,?,?,?,?,?)");
  ev.run(id, "c1", "status", "complete", "Tech A", "2026-03-01T14:05:00.000Z");
  assert.throws(() => ev.run(id, "c1", "status", "complete", "Tech A", "2026-03-01T14:05:00.000Z"), /UNIQUE|constraint/i);
  ev.run(id, "c1", "status", "complete", "Tech B", "2026-03-01T14:05:00.000Z");   // a different tech is a different act
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_events WHERE wo_id=?").get(id).n, 2);
});

test("one day log per tech per day, and credits sum to the line's payout", () => {
  const d = fresh();
  const id = seedWo(d, workOrderPayloadFrom(PROPOSAL, { rates: RATES }));
  const log = d.prepare("INSERT INTO wo_day_logs (wo_id, user_id, name, day, lines_completed, payout_total, locked_by) VALUES (?,?,?,?,?,?,?)");
  log.run(id, 5, "Tech A", "2026-03-01", 3, 150, "Tech A");
  assert.throws(() => log.run(id, 5, "Tech A", "2026-03-01", 4, 200, "Admin"), /UNIQUE|constraint/i);
  log.run(id, 6, "Tech B", "2026-03-01", 1, 28, "Admin");   // a second tech on the same day is fine

  // Requirement 26: a 50/50 split on one line.
  const cr = d.prepare("INSERT INTO wo_line_credits (wo_id, line_key, user_id, name, share, amount, set_by) VALUES (?,?,?,?,?,?,?)");
  cr.run(id, "c1a", 5, "Tech A", 0.5, 14, "Admin");
  cr.run(id, "c1a", 6, "Tech B", 0.5, 14, "Admin");
  const sum = d.prepare("SELECT ROUND(SUM(share),4) s, ROUND(SUM(amount),2) a FROM wo_line_credits WHERE wo_id=? AND line_key='c1a'").get(id);
  assert.equal(sum.s, 1);
  assert.equal(sum.a, 28, "the split still adds up to the line's payout");
});

test("the check-in is one per tech per day (requirement 16's gate)", () => {
  const d = fresh();
  const id = seedWo(d, workOrderPayloadFrom(PROPOSAL, { rates: RATES }));
  const ci = d.prepare("INSERT INTO wo_checkins (wo_id, user_id, name, day) VALUES (?,?,?,?)");
  ci.run(id, 5, "Tech A", "2026-03-01");
  assert.throws(() => ci.run(id, 5, "Tech A", "2026-03-01"), /UNIQUE|constraint/i);
  ci.run(id, 5, "Tech A", "2026-03-02");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_checkins WHERE wo_id=?").get(id).n, 2);
});

test("nothing in the work order layer writes the proposals table (requirement 9)", () => {
  for (const fn of ["createWorkOrderDoc", "saveWorkOrderDraft", "setWorkOrderNotesDoc", "setWorkOrderShowPayouts", "reseedWorkOrderPayouts"]) {
    for (const sql of sqlIn(fnBody(fn))) {
      assert.ok(!/\bproposals\b/.test(sql), `${fn} must not touch proposals: ${sql.slice(0, 70)}`);
    }
  }
  // It READS the published proposal to copy from — that is the only contact with it, and it is a read.
  assert.ok(fnBody("createWorkOrderDoc").includes("getPublishedProposal(accessId)"), "copied from the version the customer received");
  // The draft save is transactional: payload + line sync land together or not at all.
  const save = fnBody("saveWorkOrderDraft");
  assert.ok(save.includes('db.exec("BEGIN")') && save.includes('db.exec("COMMIT")') && save.includes('db.exec("ROLLBACK")'), "explicit transaction (node:sqlite has no db.transaction)");
});

test("requirement 7: a tech with payouts hidden receives no payout figure", () => {
  const body = fnBody("sanitizeWorkOrderDoc");
  assert.ok(/const office = role === "admin" \|\| role === "manager" \|\| role === "readonly";/.test(body), "the office always sees payout");
  assert.ok(body.includes("if (office || doc.showPayouts) return doc;"), "the per-work-order toggle is the second gate");
  assert.ok(/const \{ techPrice, \.\.\.rest \} = it;/.test(body), "the payout is stripped from the payload, not hidden in the UI");
  assert.ok(body.includes("total: null"), "and from the total");
  assert.ok(/lines: doc\.lines\.map\(\(\{ payout, total, \.\.\.l \}\) => l\)/.test(body), "and from every line");
});

test("the work order capabilities exist and keep the customer out", () => {
  const caps = ["wo.view", "wo.edit", "wo.payout.view", "wo.payout.edit", "wo.send", "wo.sign", "wo.checkin", "wo.line.status", "wo.day.close", "wo.close", "payroll.view", "payroll.export"];
  for (const c of caps) assert.ok(roles.includes(`"${c}"`), `${c} is defined`);
  const block = roles.slice(roles.indexOf('"wo.view"'), roles.indexOf('"payroll.export"') + 60);
  assert.ok(!/customer/.test(block), "a customer has no work-order capability at all");
  assert.ok(/"wo\.edit":\s*\["admin", "manager"\]/.test(roles), "only the office writes the document");
  assert.ok(/"wo\.sign":\s*\["tech"\]/.test(roles), "signing it is the technician's act");
});
