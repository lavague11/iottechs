// The one-time NAP correction, proven against a store that was ALREADY seeded with the old number.
//
// Why this needs its own test: seedFacts uses INSERT OR IGNORE, so on every existing install (including
// prod) company.phone keeps whatever it was first seeded with — (646) 396-0775, the number the site
// published before it was reconciled with the Google Business Profile. Public pages and all JSON-LD read
// these facts, so a stale row silently re-publishes the wrong phone and breaks the site↔listing match
// that local search depends on. That number is also the Zelle payment token, so it can't simply be
// renamed everywhere. Hermetic: its own temp DB, never the dev one.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "seo-nap-"));
process.env.TZ = "America/New_York";

const OLD = "(646) 396-0775";
const NEW = "(917) 727-0081";
let ensureSeoSchema;

before(async () => { ({ ensureSeoSchema } = await import("../lib/seo/schema.js")); });

const fresh = () => { const db = new DatabaseSync(":memory:"); ensureSeoSchema(db); return db; };
const factOf = (db, key) => db.prepare("SELECT * FROM seo_facts WHERE key=?").get(key) || null;

test("a store seeded before the fix is corrected on the next boot", () => {
  const db = fresh();
  // Reproduce the pre-fix state exactly: the old number, seeded and public.
  db.prepare("UPDATE seo_facts SET value=?, updated_by='seed' WHERE key='company.phone'").run(OLD);
  assert.equal(factOf(db, "company.phone").value, OLD, "arranged the stale row");

  ensureSeoSchema(db);                        // boot again — this is what a deploy does

  const phone = factOf(db, "company.phone");
  assert.equal(phone.value, NEW, "the stale number is rewritten");
  assert.equal(phone.verified, 1);
  assert.equal(phone.public_use_allowed, 1);
  assert.match(phone.notes, /Zelle/, "the note warns why the old number must not come back");
});

test("it is a no-op once corrected, and never clobbers an owner's own edit", () => {
  const db = fresh();
  ensureSeoSchema(db);
  assert.equal(factOf(db, "company.phone").value, NEW);

  // An owner deliberately changes the number in /dev/seo → Facts. A later deploy must leave it alone:
  // the correction only matches the one superseded value, not "anything that isn't the new number".
  db.prepare("UPDATE seo_facts SET value=?, updated_by='owner' WHERE key='company.phone'").run("(201) 555-0123");
  ensureSeoSchema(db);
  const after = factOf(db, "company.phone");
  assert.equal(after.value, "(201) 555-0123", "an owner edit survives");
  assert.equal(after.updated_by, "owner");
});

test("the new identity facts land in a store that predates them", () => {
  const db = fresh();
  // Simulate the older schema: these two keys simply didn't exist yet.
  db.prepare("DELETE FROM seo_facts WHERE key IN ('company.address','company.gbp')").run();
  ensureSeoSchema(db);
  const addr = factOf(db, "company.address"), gbp = factOf(db, "company.gbp");
  assert.ok(addr && gbp, "both inserted on the next boot");
  assert.equal(addr.value, "120 Industrial Ave #4, Little Ferry, NJ 07643");
  assert.match(gbp.value, /^https:\/\/maps\.google\.com\/\?cid=\d+$/, "a resolvable listing URL");
  for (const f of [addr, gbp]) { assert.equal(f.verified, 1); assert.equal(f.public_use_allowed, 1); }
});

test("the Zelle token is never what the fact store publishes as the phone", () => {
  const db = fresh();
  ensureSeoSchema(db);
  const pub = db.prepare("SELECT key, value FROM seo_facts WHERE verified=1 AND public_use_allowed=1").all();
  const leaked = pub.filter((f) => String(f.value).includes("396-0775"));
  assert.deepEqual(leaked, [], "no public fact carries the payment number");
});
