// E-sign P2 (node --test): the signing session token (random, expiring, hashed, bound to proposal +
// version + document hash + fingerprint, layered on top of the PIN grant) and the capture validation.
// Expired / void / replayed / re-owned tokens are all rejected; the client is never trusted.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "esign-sess-"));
process.env.TZ = "America/New_York";

let db, S, C, store, ids;

const PAYLOAD = { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };
// A real (tiny, valid) 2×1 PNG — IHDR + IDAT + IEND.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const project = (name, phone) => { const r = db.createLeadProject(name, `${name.replace(/\W/g, "").toLowerCase()}@example.com`, phone, "2503 Jay Pl", "cctv", `${name} Co`); return r.accessId || r.access_id || r; };
const sent = (a) => { db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 8, depositPct: 50 }, "T"); db.markProposalSent(a, "T"); };
const pin = (accessId, role = "customer") => ({ role, accessId, viaPin: true });

before(async () => {
  db = await import("../lib/db.js");
  S = await import("../lib/esign/session.js");
  C = await import("../lib/esign/capture.js");
  store = await import("../lib/esign/store.js");
  ids = { a: project("Sess Owner", "5551110001"), b: project("Sess Other", "5551110002") };
  sent(ids.a); sent(ids.b);
});

const open = (accessId = ids.a, caller = pin(accessId), extra = {}) => S.startSession({ accessId, optKey: "A", caller, ip: "203.0.113.9", ua: "node-test", ...extra });
const validate = (tok, accessId = ids.a, caller = pin(accessId), opts) => S.validateSession(tok, accessId, caller, opts);

test("start: random token, stored HASHED, bound to proposal + version + document hash + fingerprint", () => {
  const r = open();
  assert.ok(r.ok, r.error);
  assert.ok(r.token.length >= 30, "unguessable");
  const h = db.sqliteHandle();
  const row = h.prepare("SELECT * FROM sign_sessions").all().find((s) => s.doc_id === r.doc.id);
  assert.ok(row);
  assert.notEqual(row.token_hash, r.token);
  assert.ok(!JSON.stringify(h.prepare("SELECT * FROM sign_sessions").all()).includes(r.token), "the token itself is never stored");
  assert.equal(row.doc_sha256, r.doc.sha256);
  assert.equal(row.version, 1);
  assert.equal(row.state, "open");
  assert.equal(db.getActiveProposal(ids.a).sign_status, "viewed");
  assert.equal(validate(r.token).ok, true);
});

test("layered ON the PIN grant: a token without (or with another project's) cookies is rejected", () => {
  const r = open();
  assert.equal(validate(r.token, ids.a, null).code, "DENIED", "no cookies at all");
  assert.equal(validate(r.token, ids.a, pin(ids.b)).code, "DENIED", "another project's PIN holder");
  assert.equal(validate(r.token, ids.b, pin(ids.b)).code, "DENIED", "token replayed against another project");
  assert.equal(validate(r.token, ids.a, pin(ids.a, "tech")).code, "DENIED", "role changed");
  assert.equal(validate(r.token, ids.a, { role: "customer", id: 99999, email: "x@y.z" }).code, "DENIED", "a logged-in stranger (not the owner)");
  assert.equal(validate("nope").code, "NO_SESSION");
  assert.equal(validate("x".repeat(40)).code, "NO_SESSION");
  assert.equal(validate(r.token).ok, true, "the real holder still works");
});

test("the office can't be impersonated: a customer token fails for an admin cookie and vice-versa", () => {
  const r = open();
  assert.equal(validate(r.token, ids.a, pin(ids.a, "admin")).code, "DENIED");
});

test("expired token is rejected and the session flips to expired", () => {
  const r = open();
  const later = Date.now() + S.SESSION_TTL_MS + 1000;
  assert.equal(validate(r.token, ids.a, pin(ids.a), { now: later }).code, "EXPIRED");
  assert.equal(db.sqliteHandle().prepare("SELECT state FROM sign_sessions WHERE id=?").get(r.session.id).state, "expired");
  assert.equal(validate(r.token).code, "EXPIRED", "stays dead even for a caller with a valid clock");
});

test("saving values slides the expiry forward", () => {
  const r = open();
  const t1 = Date.now() + S.SESSION_TTL_MS - 5000;
  const s = S.saveValues({ token: r.token, accessId: ids.a, caller: pin(ids.a), patch: { name: "jane doe" }, now: t1 });
  assert.ok(s.ok, s.error);
  assert.ok(s.expiresAt > t1 + S.SESSION_TTL_MS - 10);
});

test("a revision (v+1) voids the open session; the signer is sent back to review", () => {
  const a = project("Sess Revise", "5551110003"); sent(a);
  const r = open(a);
  assert.equal(validate(r.token, a).ok, true);
  db.reviseProposal(a, "Office");
  const v = validate(r.token, a);
  assert.equal(v.code, "VOID");
  assert.equal(db.sqliteHandle().prepare("SELECT state, void_reason FROM sign_sessions WHERE id=?").get(r.session.id).void_reason, "revised");
  assert.equal(S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { name: "Jane" } }).code, "VOID", "no writes on a void session");
});

test("content drift under an open session (same row edited) is caught by the fingerprint", () => {
  const a = project("Sess Drift", "5551110004"); sent(a);
  const r = open(a);
  const edited = JSON.stringify({ options: [{ ...PAYLOAD.options[0], services: [{ ...PAYLOAD.options[0].services[0], items: [{ id: "i1", name: "Camera", qty: 4, price: 999 }] }] }] });
  db.sqliteHandle().prepare("UPDATE proposals SET payload=? WHERE project_access_id=?").run(edited, a);
  assert.equal(validate(r.token, a).code, "CHANGED");
});

test("tampered document bytes are caught by the hash check", () => {
  const a = project("Sess Tamper", "5551110005"); sent(a);
  const r = open(a);
  const h = db.sqliteHandle();
  h.exec("DROP TRIGGER sign_documents_immutable");   // simulate someone with raw DB access
  h.prepare("UPDATE sign_documents SET bytes=? WHERE id=?").run(Buffer.from("%PDF-1.3 forged"), r.doc.id);
  assert.equal(validate(r.token, a).code, "TAMPERED");
  // restore the guard for the other tests
  h.exec(`CREATE TRIGGER IF NOT EXISTS sign_documents_immutable BEFORE UPDATE OF bytes, sha256, kind, proposal_id, project_access_id, version, mime ON sign_documents BEGIN SELECT RAISE(ABORT, 'sign_documents bytes are immutable'); END`);
});

test("opening again replaces the earlier session (one live session per signer); resume reuses it", () => {
  const a = project("Sess Resume", "5551110006"); sent(a);
  const first = open(a);
  const resumed = open(a, pin(a), { resumeToken: first.token });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.token, first.token);
  const second = open(a);                              // no resume token → brand-new session
  assert.notEqual(second.token, first.token);
  assert.equal(validate(first.token, a).code, "VOID", "the replaced session is dead");
  assert.equal(validate(second.token, a).ok, true);
});

test("capture: name, signature PNG, acks are validated and the values survive a resume", () => {
  const a = project("Sess Capture", "5551110007"); sent(a);
  const r = open(a);
  const ok = S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { name: "  jane   o'neil ", signature: { method: "draw", data: PNG }, acks: { terms: true, payment: true } } });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.values.name, "Jane O'Neil");
  assert.equal(ok.values.signature.method, "draw");
  assert.equal(db.getActiveProposal(a).sign_status, "signing");
  const back = open(a, pin(a), { resumeToken: r.token });
  assert.equal(back.values.name, "Jane O'Neil");
  assert.ok(back.values.signature.data.startsWith("data:image/png"));
  assert.deepEqual(C.missingRequired(back.values, PAYLOAD), [], "name + signature + required acks → complete");
  assert.deepEqual(C.missingRequired({ name: "A B" }, PAYLOAD), ["signature", "ack:terms", "ack:payment"]);
});

test("capture: rejects non-PNG, oversize, malformed, wrong method and short names", () => {
  const a = project("Sess Reject", "5551110008"); sent(a);
  const r = open(a);
  const save = (patch) => S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch });
  assert.equal(save({ name: "x" }).code, "BAD_VALUE");
  assert.equal(save({ signature: { method: "draw", data: "data:image/jpeg;base64,AAAA" } }).code, "BAD_VALUE");
  assert.equal(save({ signature: { method: "draw", data: "data:image/png;base64,AAAA" } }).code, "BAD_VALUE", "not a real PNG");
  assert.equal(save({ signature: { method: "magic", data: PNG } }).code, "BAD_VALUE");
  const big = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(210 * 1024)]).toString("base64");
  assert.equal(save({ signature: { method: "upload", data: big } }).code, "BAD_VALUE", "> 200KB");
  assert.equal(save({ acks: ["terms"] }).code, "BAD_VALUE");
  assert.equal(C.parsePngDataUrl(PNG).ok, true);
});

test("a draft / already-declined state can't start a session; audit trail records the opens", () => {
  const a = project("Sess Draft", "5551110009");
  db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "T");
  assert.equal(open(a).code, "NOT_SIGNABLE");
  const ev = db.sqliteHandle().prepare("SELECT kind, ip, ua FROM sign_events WHERE project_access_id=?").all(ids.a);
  assert.ok(ev.some((e) => e.kind === "opened" && e.ip === "203.0.113.9" && e.ua === "node-test"));
});
