// B2 + B3 — the additive, reversible addendum store.
//
// The constraint that shaped this: `sign_documents` holds signed contractual PDFs behind a CHECK
// constraint and an immutability trigger, and the owner's instruction is never to drop, truncate or
// rewrite it. So addenda get a parallel store (B2's option 2) and the proposal e-sign path is left
// exactly as it is. Nothing in the app reads these tables yet, which is what makes the down
// migration a plain DROP with nothing to restore.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ensureAddendumSchema, dropAddendumSchema, addendumRowsFromBlob } from "../lib/addendum-schema.js";

const NEW_TABLES = ["addendums", "addendum_versions", "addendum_sign_documents", "addendum_sign_sessions"];
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);

test("the migration is additive: it creates its own tables and alters nothing existing", () => {
  const db = new DatabaseSync(":memory:");
  // stand-ins for the tables that must not be touched
  db.exec("CREATE TABLE sign_documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('unsigned','signed','certificate')))");
  db.exec("CREATE TABLE project_tool_data (project_access_id TEXT, tool TEXT, data TEXT)");
  db.prepare("INSERT INTO sign_documents (id, kind) VALUES ('d1','signed')").run();
  const before = tables(db);
  const sqlBefore = db.prepare("SELECT sql FROM sqlite_master WHERE name='sign_documents'").get().sql;

  ensureAddendumSchema(db);

  const after = tables(db);
  assert.deepEqual(after.filter((t) => !before.includes(t)).sort(), [...NEW_TABLES].sort(), "exactly the four new tables");
  assert.deepEqual(before.filter((t) => !after.includes(t)), [], "nothing removed");
  assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='sign_documents'").get().sql, sqlBefore,
    "sign_documents' definition is byte-identical — not rebuilt");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sign_documents").get().n, 1, "and its rows are untouched");
});

test("it is idempotent — running it twice is the same as running it once", () => {
  const db = new DatabaseSync(":memory:");
  ensureAddendumSchema(db);
  const first = tables(db);
  db.prepare("INSERT INTO addendums (id, project_access_id, seq) VALUES ('a1','ASC0001',1)").run();
  ensureAddendumSchema(db);
  assert.deepEqual(tables(db), first);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM addendums").get().n, 1, "a second run keeps the rows");
});

test("the down migration is the exact inverse, and loses nothing", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE project_tool_data (project_access_id TEXT, tool TEXT, data TEXT)");
  const blob = JSON.stringify({ addendums: [{ id: "x1", title: "Extra cameras", status: "approved", items: [{ name: "Cam", qty: 2, price: 175 }] }] });
  db.prepare("INSERT INTO project_tool_data VALUES ('ASC0001','addendum',?)").run(blob);
  const before = tables(db);

  ensureAddendumSchema(db);
  for (const r of addendumRowsFromBlob("ASC0001", blob))
    db.prepare("INSERT INTO addendums (id, project_access_id, seq, title, status, items_json) VALUES (?,?,?,?,?,?)")
      .run(r.id, r.project_access_id, r.seq, r.title, r.status, r.items_json);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM addendums").get().n, 1);

  dropAddendumSchema(db);
  assert.deepEqual(tables(db), before, "back to exactly the tables we started with");
  // the source the rows came from is still there, which is why dropping is lossless
  assert.equal(db.prepare("SELECT data FROM project_tool_data WHERE tool='addendum'").get().data, blob,
    "the JSON blob is byte-identical — it was only ever read");
});

test("the blob maps to rows without being changed, and numbering starts at 1", () => {
  const blob = JSON.stringify({ addendums: [
    { id: "a", title: "First", status: "approved", items: [{ name: "x", qty: 1, price: 10 }], at: "2026-07-09T08:46:01.138Z", signedName: "Admin", signedAt: "2026-07-09T08:47:48.167Z", signedFingerprint: "fp1" },
    { id: "b", title: "Second", status: "pending", discount: 25 },
  ] });
  const rows = addendumRowsFromBlob("ASC0001", blob);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.seq), [1, 2], "1-based, in blob order");
  assert.equal(rows[0].signed_name, "Admin");
  assert.equal(rows[0].signed_fingerprint, "fp1");
  assert.equal(rows[0].created_at, "2026-07-09T08:46:01.138Z");
  assert.equal(JSON.parse(rows[0].items_json).length, 1);
  assert.equal(rows[1].discount, 25);
  assert.equal(rows[1].items_json, "[]", "a missing items array becomes empty, not null");
  // an entry with no id still gets a stable one derived from the project + position
  assert.equal(addendumRowsFromBlob("ASC0002", JSON.stringify({ addendums: [{ title: "No id" }] }))[0].id, "ASC0002-1");
  assert.deepEqual(addendumRowsFromBlob("ASC0003", "not json"), []);
  assert.deepEqual(addendumRowsFromBlob("ASC0003", JSON.stringify({})), []);
});

test("the addendum document store carries the same immutability promise as the proposal one", () => {
  const db = new DatabaseSync(":memory:");
  ensureAddendumSchema(db);
  db.prepare("INSERT INTO addendum_sign_documents (id, addendum_id, project_access_id, kind, sha256, bytes) VALUES ('d1','a1','ASC0001','signed','abc',X'00')").run();
  assert.throws(() => db.prepare("UPDATE addendum_sign_documents SET bytes=X'01' WHERE id='d1'").run(),
    /immutable/, "signed bytes cannot be rewritten");
  // but voiding is allowed, so history is kept rather than erased
  db.prepare("UPDATE addendum_sign_documents SET voided=1 WHERE id='d1'").run();
  assert.equal(db.prepare("SELECT voided FROM addendum_sign_documents WHERE id='d1'").get().voided, 1);
  assert.throws(() => db.prepare("INSERT INTO addendum_sign_documents (id, addendum_id, project_access_id, kind, sha256, bytes) VALUES ('d2','a1','ASC0001','nonsense','abc',X'00')").run(),
    /CHECK/, "the kind is constrained, as it is for proposals");
});

test("the script is dry-run by default, refuses the live db, and never writes anything existing", () => {
  const s = readFileSync(new URL("../scripts/migrate-addendum-store.mjs", import.meta.url), "utf8");
  assert.match(s, /if \(\(APPLY \|\| DOWN\) && !CONFIRMED\)/, "--apply and --down both need --i-have-a-backup");
  assert.match(s, /REFUSED: that is the LIVE database/);
  assert.match(s, /if \(!APPLY\) \{[\s\S]{0,400}DRY RUN/, "dry run is the default");
  assert.match(s, /dropAddendumSchema\(raw\)/, "--down is wired to the exact inverse");
  // the only writes are CREATE TABLE and inserts into the NEW tables
  assert.doesNotMatch(s, /UPDATE project_tool_data|DELETE FROM project_tool_data|DROP TABLE sign_|UPDATE sign_|DELETE FROM sign_/,
    "it must never write the blob or the proposal signing tables");
});
