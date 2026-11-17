// B2 + B3 — the ADDITIVE, REVERSIBLE half of the addendum cluster.
//
//   DRY RUN IS THE DEFAULT. `--apply` creates the new tables and copies the JSON blob's addenda
//   forward into them. `--down` drops them again. NOTHING existing is ever written: the blob is read
//   and left exactly as it is, and `sign_documents` / `sign_sessions` / `sign_events` are not touched
//   at all — the owner's instruction was never to drop, truncate or rewrite the table holding signed
//   PDFs, so addenda get a parallel store instead (B2's option 2).
//
// Same safety contract as the sibling migration scripts: the live database is refused unless you name
// it, and a real apply needs --i-have-a-backup.
//
//   node scripts/migrate-addendum-store.mjs --snapshot /tmp/iot-rehearsal     # copy + dry run  <- START
//   node scripts/migrate-addendum-store.mjs --db /tmp/iot-rehearsal --apply --i-have-a-backup
//   node scripts/migrate-addendum-store.mjs --db /tmp/iot-rehearsal --down --i-have-a-backup
//   node scripts/migrate-addendum-store.mjs --apply --i-have-a-backup        # THE REAL RUN
//
// Reversibility: --down runs dropAddendumSchema, the exact inverse. There is nothing to restore
// afterwards, because every row these tables hold is derived from the blob, which still has it.
import { mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const APPLY = has("--apply"), DOWN = has("--down"), CONFIRMED = has("--i-have-a-backup"), ALLOW_LIVE = has("--allow-live");
const dbDirArg = val("--db"), snapArg = val("--snapshot");

if ((APPLY || DOWN) && !CONFIRMED) {
  console.error("\n  REFUSED: --apply / --down need --i-have-a-backup as well.\n");
  process.exit(2);
}

const db = await import("../lib/db.js");
const liveFile = path.join(db.dbDir(), "dashboard.db");
if (snapArg) {
  mkdirSync(snapArg, { recursive: true });
  for (const sfx of ["", "-wal", "-shm"]) if (existsSync(liveFile + sfx)) copyFileSync(liveFile + sfx, path.join(snapArg, "dashboard.db" + sfx));
  process.env.DB_DIR = snapArg;
} else if (dbDirArg) process.env.DB_DIR = dbDirArg;

const dbFile = path.join(db.dbDir(), "dashboard.db");
const onLive = path.resolve(dbFile) === path.resolve(liveFile);
console.log(`\n  database: ${dbFile}${onLive ? "   <- LIVE" : ""}`);
if (existsSync(dbFile)) console.log(`  file:     ${statSync(dbFile).size} bytes`);
if (onLive && !(snapArg || dbDirArg) && !ALLOW_LIVE && !((APPLY || DOWN) && CONFIRMED)) {
  console.error(`\n  REFUSED: that is the LIVE database. Rehearse on a copy:\n    node scripts/migrate-addendum-store.mjs --snapshot ${path.join(path.sep === "\\" ? "C:\\temp" : "/tmp", "iot-rehearsal")}\n`);
  process.exit(3);
}

const { ensureAddendumSchema, dropAddendumSchema, addendumRowsFromBlob } = await import("../lib/addendum-schema.js");
// lib/db.js exposes no raw handle, so open the SAME file directly. Safe: the only writes are the
// CREATE TABLEs and inserts into the new tables.
const { DatabaseSync } = await import("node:sqlite");
const raw = new DatabaseSync(dbFile);

if (DOWN) {
  dropAddendumSchema(raw);
  console.log("\n  DOWN: addendums, addendum_versions, addendum_sign_documents, addendum_sign_sessions dropped.");
  console.log("  The JSON blob is untouched, so nothing was lost.\n");
  process.exit(0);
}

// --- plan (read-only)
const blobs = raw.prepare("SELECT project_access_id aid, data FROM project_tool_data WHERE tool='addendum'").all();
const rows = [];
for (const b of blobs) rows.push(...addendumRowsFromBlob(b.aid, b.data));
const signed = rows.filter((r) => r.signed_name);
console.log(`\n  addendum blobs: ${blobs.length}`);
console.log(`  addenda found:  ${rows.length}  (${signed.length} already signed)`);
for (const r of rows) console.log(`    ${r.project_access_id}  A${r.seq}  "${r.title || "(untitled)"}"  ${r.status || "-"}${r.signed_name ? `  signed by ${r.signed_name}` : ""}`);

if (!APPLY) {
  console.log("\n  DRY RUN — nothing was created. Re-run with --apply --i-have-a-backup.");
  console.log("  Applying creates 4 tables and copies the rows above into them. It writes nothing");
  console.log("  existing: the blob stays the live source of truth and sign_documents is not touched.\n");
  process.exit(0);
}

ensureAddendumSchema(raw);
const ins = raw.prepare(`INSERT INTO addendums (id, project_access_id, seq, title, status, discount, items_json, signed_name, signed_at, signed_fingerprint, created_at, source)
  VALUES (?,?,?,?,?,?,?,?,?,?,?, 'blob')
  ON CONFLICT(id) DO UPDATE SET seq=excluded.seq, title=excluded.title, status=excluded.status, discount=excluded.discount,
    items_json=excluded.items_json, signed_name=excluded.signed_name, signed_at=excluded.signed_at,
    signed_fingerprint=excluded.signed_fingerprint, created_at=excluded.created_at, synced_at=datetime('now','localtime')`);
const insV = raw.prepare(`INSERT OR IGNORE INTO addendum_versions (addendum_id, project_access_id, version, payload_json, fingerprint, signed_name, signed_at)
  VALUES (?,?,?,?,?,?,?)`);
let n = 0;
for (const r of rows) {
  ins.run(r.id, r.project_access_id, r.seq, r.title, r.status, r.discount, r.items_json, r.signed_name, r.signed_at, r.signed_fingerprint, r.created_at);
  insV.run(r.id, r.project_access_id, 1, r.items_json, r.signed_fingerprint, r.signed_name, r.signed_at);
  n++;
}
console.log(`\n  APPLIED: ${n} addendum row(s) copied forward into the new tables.`);
console.log("  The JSON blob and sign_documents are byte-identical to before.");
console.log("  Reverse with: node scripts/migrate-addendum-store.mjs --down --i-have-a-backup\n");
