// E-sign P0 (node --test): the unsigned proposal PDF is generated server-side ONCE, stored as a BLOB with
// its sha256, reused while the content is unchanged, and served only through a read gate that lets the
// project's own people in and keeps everyone else out. Runs against a throwaway SQLite file.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "esign-"));
process.env.TZ = "America/New_York";

let db, store, source, serve, auth, ids;

const PAYLOAD = {
  options: [
    { id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 150, cost: 60, techPrice: 90, techPay: 40 }] }] },
    { id: "B", name: "Alternative Option", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i2", name: "Camera", qty: 2, price: 150 }] }] },
  ],
};

function project(name, phone) {
  const r = db.createLeadProject(name, `${name.replace(/\W/g, "").toLowerCase()}@example.com`, phone, "2503 Jay Pl", "cctv", `${name} Co`);
  return r.accessId || r.access_id || r;
}
function sentProposal(accessId) {
  db.saveProposalDraft(accessId, { payload: PAYLOAD, taxRate: 8, depositPct: 50 }, "Tester");
  db.markProposalSent(accessId, "Tester");
}

before(async () => {
  db = await import("../lib/db.js");
  store = await import("../lib/esign/store.js");
  source = await import("../lib/esign/proposal-source.js");
  serve = await import("../lib/esign/serve.js");
  auth = await import("../lib/auth.js");
  const a = project("Esign Owner", "5550001111"), b = project("Esign Stranger", "5550002222");
  sentProposal(a);
  ids = { a, b };
});

test("generates the unsigned PDF once: bytes + sha256 stored, proposal row points at it", () => {
  const r = source.ensureProposalUnsigned(ids.a, "A", { by: "Tester" });
  assert.ok(!r.error, r.error);
  assert.equal(r.reused, false);
  const doc = store.getDocument(r.doc.id);
  assert.equal(doc.kind, "unsigned");
  assert.equal(doc.bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(doc.sha256, store.sha256Hex(doc.bytes), "recorded hash matches the stored bytes");
  assert.ok(store.documentIntact(doc.id));
  assert.equal(db.getActiveProposal(ids.a).unsigned_doc_id, doc.id);
  // The renderer reported the acceptance block as page-fraction fields for the viewer to overlay.
  const fields = doc.meta.fields;
  assert.deepEqual(fields.map((f) => f.type).sort(), ["date", "name", "signature"]);
  for (const f of fields) {
    assert.ok(f.page >= 1);
    for (const k of ["x", "y", "w", "h"]) assert.ok(f[k] >= 0 && f[k] <= 1, `${f.key}.${k} is a page fraction`);
    assert.ok(f.x + f.w <= 1 && f.y + f.h <= 1);
  }
});

test("non-deterministic PDF is STORED: a second call reuses the same document, no new row", () => {
  const before = source.ensureProposalUnsigned(ids.a, "A");
  const again = source.ensureProposalUnsigned(ids.a, "A");
  assert.equal(again.reused, true);
  assert.equal(again.doc.id, before.doc.id);
  assert.equal(again.doc.sha256, before.doc.sha256);
});

test("customer-facing PDF never carries wholesale cost or tech payout", () => {
  const { doc } = source.ensureProposalUnsigned(ids.a, "A");
  const text = store.getDocument(doc.id).bytes.toString("latin1");
  assert.ok(!/techPay|techPrice/.test(text));
});

test("signing a different option stores a new document and voids the stale one", () => {
  const a = source.ensureProposalUnsigned(ids.a, "A").doc;
  const b = source.ensureProposalUnsigned(ids.a, "B").doc;
  assert.notEqual(a.id, b.id);
  assert.equal(store.getDocumentInfo(a.id).voided, true, "history kept, just not served");
  assert.equal(db.getActiveProposal(ids.a).unsigned_doc_id, b.id);
});

test("documents are immutable (bytes can't be rewritten), the audit trail is append-only", () => {
  const { doc } = source.ensureProposalUnsigned(ids.a, "A");
  const h = db.sqliteHandle();
  assert.throws(() => h.prepare("UPDATE sign_documents SET bytes=? WHERE id=?").run(Buffer.from("x"), doc.id), /immutable/);
  store.recordSignEvent({ accessId: ids.a, proposalId: 1, kind: "test" });
  assert.throws(() => h.prepare("UPDATE sign_events SET kind='x'").run(), /append-only/);
  assert.throws(() => h.prepare("DELETE FROM sign_events").run(), /append-only/);
});

const cookie = async (accessId, role) => `iot_access=${await auth.makeAccessToken(accessId, role)}`;

test("read gate: the project's own customer (PIN grant) gets the exact bytes", async () => {
  const { doc } = source.ensureProposalUnsigned(ids.a, "A");
  const r = await serve.serveSignDocument(doc.id, await cookie(ids.a, "customer"));
  assert.equal(r.status, 200);
  assert.equal(r.headers["Content-Type"], "application/pdf");
  assert.equal(store.sha256Hex(r.body), doc.sha256);
});

test("read gate: non-owner, other project's PIN, anonymous, tech and bad ids are all denied", async () => {
  const { doc } = source.ensureProposalUnsigned(ids.a, "A");
  assert.equal((await serve.serveSignDocument(doc.id, await cookie(ids.b, "customer"))).status, 404, "another project's customer");
  assert.equal((await serve.serveSignDocument(doc.id, "")).status, 404, "anonymous");
  assert.equal((await serve.serveSignDocument(doc.id, await cookie(ids.a, "tech"))).status, 404, "tech never sees retail pricing");
  assert.equal((await serve.serveSignDocument(doc.id, "iot_access=garbage")).status, 404, "forged cookie");
  assert.equal((await serve.serveSignDocument("../etc/passwd", await cookie(ids.a, "customer"))).status, 404, "malformed id");
  assert.equal((await serve.serveSignDocument("0".repeat(32), await cookie(ids.a, "customer"))).status, 404, "unknown id");
});

test("read gate: office reads it; a voided document is served to the office only", async () => {
  const a = source.ensureProposalUnsigned(ids.a, "A").doc;
  source.ensureProposalUnsigned(ids.a, "B");                      // voids A
  const staff = `iot_access=${await auth.makeAccessToken(ids.a, "admin")}`;
  assert.equal((await serve.serveSignDocument(a.id, staff)).status, 200, "admin sees history");
  assert.equal((await serve.serveSignDocument(a.id, await cookie(ids.a, "customer"))).status, 404, "customer doesn't get a voided doc");
});

test("a draft or already-signed proposal can't be put in front of a signer", () => {
  const c = project("Esign Draft", "5550003333");
  db.saveProposalDraft(c, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "Tester");
  assert.match(source.ensureProposalUnsigned(c, "A").error, /hasn't been sent/);
  assert.match(source.ensureProposalUnsigned(ids.a, "Z").error, /isn't available/);
});
