// Section N — /my-projects ownership at the DB level (throwaway DB_DIR; no real rows).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "myproj-"));
process.env.TZ = "America/New_York";
let db;
before(async () => { db = await import("../lib/db.js"); });

const ids = (rows) => rows.map((r) => r.access_id).sort();

test("email match, and a different customer sees nothing", () => {
  const a = db.createLeadProject("Ann Owner", "ann@own.test", "(646) 555-0101", "1 A St", "Security Cameras", "Ann Pizza");
  const accessId = a.accessId, ann = db.getUserById(a.userId);
  const bob = db.getUserById(db.createLeadProject("Bob Other", "bob@other.test", "(201) 555-0199", "9 Z St", "Security Cameras").userId);
  assert.deepEqual(ids(db.getOwnedProjectsForCustomer({ userId: ann.id, email: ann.email, phone: ann.phone })), [accessId]);
  assert.ok(!ids(db.getOwnedProjectsForCustomer({ userId: bob.id, email: bob.email, phone: bob.phone })).includes(accessId), "Bob must not see Ann's project");
  assert.ok(!ids(db.getOwnedProjectsForCustomer({ userId: ann.id, email: ann.email, phone: ann.phone })).some((x) => x !== accessId), "Ann sees only her own");
  assert.deepEqual(db.getOwnedProjectsForCustomer({}), []);
});

for (const [stored, acct] of [["+1 917.555.0731", "(917) 555-0731"], ["1-917-555-0732", "(917) 555-0732"], ["917 555 0733", "(917) 555-0733"]]) {
  test(`phone-only project stored as "${stored}" is found for an account with ${acct}`, () => {
    const cat = db.getUserById(db.createLeadProject("Cat Phone", `cat${acct.slice(-4)}@ph.test`, acct, "5 E St", "Security Cameras", null, undefined, { allowDuplicate: true }).userId);
    // allowDuplicate → a distinct customer row, so ownership must come from the PHONE rule, not customer_id.
    const { accessId, userId } = db.createLeadProject("Phone Only", null, stored, "2 B St", "Security Cameras", null, undefined, { allowDuplicate: true });
    assert.notEqual(userId, cat.id);
    assert.ok(ids(db.getOwnedProjectsForCustomer({ userId: cat.id, email: cat.email, phone: cat.phone })).includes(accessId));
  });
}

test("a different phone does not match", () => {
  const dee = db.getUserById(db.createLeadProject("Dee Else", "dee@else.test", "(646) 555-0999", "6 F St", "Security Cameras").userId);
  const { accessId } = db.createLeadProject("Phone Only", null, "(646) 555-0143", "3 C St", "Security Cameras", null, undefined, { allowDuplicate: true });
  assert.ok(!ids(db.getOwnedProjectsForCustomer({ userId: dee.id, email: dee.email, phone: dee.phone })).includes(accessId));
});
