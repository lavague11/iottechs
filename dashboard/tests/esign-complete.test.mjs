// E-sign P3 (node --test): completion flattens a NEW immutable signed PDF from the stored unsigned one,
// runs the existing accept + sign lifecycle (fingerprint binding, snapshot, stage advance), writes the
// certificate of completion + audit trail, and can't be replayed or raced.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "esign-done-"));
process.env.TZ = "America/New_York";

let db, S, K, store, serve, auth, P, pdfjs;

const PAYLOAD = { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };

// A real PNG (RGBA, diagonal stroke) so pdf-lib can actually embed it.
function makePng(w = 120, h = 40) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 4 + 1) + 1 + x * 4, onStroke = Math.abs(x - (y * w) / h) < 3;
    if (onStroke) raw.set([16, 32, 74, 255], o);
  }
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + bytes.toString("base64");
}
const SIG = makePng();

const project = (name, phone) => { const r = db.createLeadProject(name, `${name.replace(/\W/g, "").toLowerCase()}@example.com`, phone, "2503 Jay Pl", "cctv", `${name} Co`); return r.accessId || r.access_id || r; };
const sent = (a) => { db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 8, depositPct: 50 }, "T"); db.markProposalSent(a, "T"); };
const pin = (a, role = "customer") => ({ role, accessId: a, viaPin: true });
const ACKS = { terms: true, payment: true, marketing: false };

async function ready(name, phone) {
  const a = project(name, phone); sent(a);
  const r = S.startSession({ accessId: a, optKey: "A", caller: pin(a), ip: "203.0.113.9", ua: "node-test/1.0" });
  assert.ok(r.ok, r.error);
  const sv = S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { name: "jordan rivera", signature: { method: "draw", data: SIG }, acks: ACKS }, ip: "203.0.113.9", ua: "node-test/1.0" });
  assert.ok(sv.ok, sv.error);
  return { a, token: r.token, unsignedId: r.doc.id };
}
const done = (x, extra = {}) => K.completeSession({ token: x.token, accessId: x.a, caller: pin(x.a), ip: "203.0.113.9", ua: "node-test/1.0", ...extra });

// Text of every page via pdf.js (what a reader would show).
async function pageTexts(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) { const t = await (await doc.getPage(i)).getTextContent(); out.push(t.items.map((x) => x.str).join(" ")); }
  return out;
}

before(async () => {
  db = await import("../lib/db.js");
  S = await import("../lib/esign/session.js");
  K = await import("../lib/esign/complete.js");
  store = await import("../lib/esign/store.js");
  serve = await import("../lib/esign/serve.js");
  auth = await import("../lib/auth.js");
  P = await import("pdf-lib");
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
});

test("completes: NEW signed PDF stored with its hash; the unsigned original is preserved untouched", async () => {
  const x = await ready("Done One", "5552220001");
  const before = store.getDocument(x.unsignedId);
  const r = await done(x);
  assert.ok(r.ok, r.error);
  const signed = store.getDocument(r.signedDocId);
  assert.equal(signed.kind, "signed");
  assert.equal(signed.sha256, store.sha256Hex(signed.bytes));
  assert.equal(signed.sha256, r.signedSha256);
  assert.notEqual(signed.sha256, before.sha256);
  assert.equal(signed.meta.fromDocId, x.unsignedId);
  const after = store.getDocument(x.unsignedId);
  assert.equal(after.sha256, before.sha256, "unsigned original is byte-identical");
  assert.equal(Buffer.compare(after.bytes, before.bytes), 0);
  assert.equal(after.voided, false, "and still current history, not voided");
  const p = db.getActiveProposal(x.a);
  assert.equal(p.signed_doc_id, signed.id);
  assert.equal(p.unsigned_doc_id, x.unsignedId);
  assert.equal(p.sign_status, "signed");
});

test("the signature is embedded as a PNG image and name/date are stamped on the acceptance page", async () => {
  const x = await ready("Done Two", "5552220002");
  const r = await done(x);
  const un = store.getDocument(x.unsignedId), sg = store.getDocument(r.signedDocId);
  const imgs = async (buf) => { const d = await P.PDFDocument.load(buf); return d.context.enumerateIndirectObjects().filter(([, o]) => o?.dict?.get?.(P.PDFName.of("Subtype")) === P.PDFName.of("Image")).length; };
  const added = (await imgs(sg.bytes)) - (await imgs(un.bytes));
  assert.ok(added === 1 || added === 2, `the signature PNG (+ its alpha mask) was embedded (added ${added})`);
  const pages = await pageTexts(sg.bytes);
  const pagesUn = await pageTexts(un.bytes);
  const last = pages.length - 1;
  assert.match(pages[last], /Jordan Rivera/);
  assert.match(pages[last], /ACCEPTED/);
  assert.match(pages[last], /\d{4} · \d{1,2}:\d{2} (AM|PM) ET/, "date stamped in the record's own format");
  assert.doesNotMatch(pagesUn[last], /Jordan Rivera|ACCEPTED/);
  assert.equal(pages.length, pagesUn.length, "no pages added or lost");
});

test("lifecycle: accepted + signed through the existing machinery; fingerprint + snapshot match what was shown", async () => {
  const x = await ready("Done Three", "5552220003");
  const row = db.getActiveProposal(x.a);
  const fp = (await import("../lib/proposal.js")).proposalFingerprint(row.payload, row.tax_rate, row.deposit_pct);
  const sessFp = db.sqliteHandle().prepare("SELECT fingerprint FROM sign_sessions WHERE token_hash IS NOT NULL AND proposal_id=? ORDER BY rowid DESC").get(row.id).fingerprint;
  assert.equal(sessFp, fp);
  const r = await done(x);
  assert.ok(r.ok);
  const p = db.getActiveProposal(x.a);
  assert.equal(p.status, "accepted");
  assert.deepEqual(JSON.parse(p.accepted_options), ["A"]);
  assert.equal(p.signed_name, "Jordan Rivera");
  assert.equal(p.signed_fingerprint, fp, "binds to the same content fingerprint the session was bound to");
  assert.equal(p.signed_payload, row.payload, "frozen snapshot of exactly what was signed");
  assert.equal(p.signature_data, SIG, "legacy signature_data keeps the PNG (on-screen + legacy PDF render it)");
  assert.deepEqual(JSON.parse(p.signed_acks), { terms: true, payment: true, pcp: false, marketing: false });
  assert.equal(typeof r.stage, "string");
  const ev = db.getProjectEvents(x.a).find((e) => e.kind === "sign");
  assert.match(ev.label, /Proposal v1 signed \(PDF\) — Option A by Jordan Rivera/);
});

test("certificate of completion: signer, role, email, timestamps, IP, UA, both hashes, per-field method, timeline", async () => {
  const x = await ready("Done Four", "5552220004");
  const r = await done(x);
  const signed = store.getDocument(r.signedDocId);
  const cert = store.getDocument(signed.meta.certificateDocId);
  assert.equal(cert.kind, "certificate");
  assert.equal(cert.sha256, store.sha256Hex(cert.bytes));
  const txt = (await pageTexts(cert.bytes)).join(" ");
  const row = db.getActiveProposal(x.a);
  for (const needle of [
    "Certificate of Completion", `PROP-${String(row.id).padStart(4, "0")}-v1`, "Option A", x.a,
    "Jordan Rivera", "Customer", "donefour@example.com", "Project PIN",
    "203.0.113.9", "node-test/1.0",
    signed.meta.unsignedSha256.slice(0, 20), r.signedSha256.slice(0, 20), signed.meta.fingerprint,
    "Drawn", "Typed by the signer", "Stamped by the server", "Document opened", "Signature adopted", "Signed",
    "Master Terms",
  ]) assert.ok(txt.replace(/\s+/g, "").includes(needle.replace(/\s+/g, "")), `certificate mentions: ${needle}`);
  // the hashes it prints are the real ones (a wrapped 64-hex run, whitespace aside)
  assert.ok(txt.replace(/\s+/g, "").includes(r.signedSha256));
  assert.ok(txt.replace(/\s+/g, "").includes(signed.meta.unsignedSha256));
});

test("append-only audit trail records open → name → signature → acks → completed with ip + ua", async () => {
  const x = await ready("Done Five", "5552220005");
  await done(x);
  const pid = db.getActiveProposal(x.a).id;
  const kinds = store.listSignEvents(pid).map((e) => e.kind);
  assert.deepEqual(kinds, ["opened", "set_name", "set_signature", "set_acks", "completed"]);
  const last = store.listSignEvents(pid).at(-1);
  assert.equal(last.ip, "203.0.113.9"); assert.equal(last.ua, "node-test/1.0");
  assert.ok(JSON.parse(last.detail).signedSha256);
});

test("replay: the same token can't complete (or save) twice; a second session can't re-sign a signed proposal", async () => {
  const x = await ready("Done Six", "5552220006");
  assert.ok((await done(x)).ok);
  assert.equal((await done(x)).code, "USED");
  assert.equal(S.saveValues({ token: x.token, accessId: x.a, caller: pin(x.a), patch: { name: "Mallory Eve" } }).code, "USED");
  assert.match(S.startSession({ accessId: x.a, optKey: "A", caller: pin(x.a) }).error, /already signed/);
  assert.equal(db.getActiveProposal(x.a).signed_name, "Jordan Rivera");
});

test("race: two completions at once → exactly one wins, one signed document", async () => {
  const x = await ready("Done Seven", "5552220007");
  const rs = await Promise.all([done(x), done(x), done(x)]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.ok(rs.filter((r) => !r.ok).every((r) => ["USED", "BUSY"].includes(r.code)), JSON.stringify(rs.map((r) => r.code)));
  const n = db.sqliteHandle().prepare("SELECT COUNT(*) c FROM sign_documents WHERE proposal_id=? AND kind='signed'").get(db.getActiveProposal(x.a).id).c;
  assert.equal(n, 1);
});

test("required fields + acknowledgments are enforced server-side (nothing is signed, session stays usable)", async () => {
  const a = project("Done Eight", "5552220008"); sent(a);
  const r = S.startSession({ accessId: a, optKey: "A", caller: pin(a) });
  const x = { a, token: r.token };
  assert.equal((await done(x)).code, "MISSING", "nothing captured yet");
  S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { name: "Pat Doe", signature: { method: "type", data: SIG } } });
  assert.equal((await done(x)).code, "MISSING", "required acks not checked");
  S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { acks: { terms: true, payment: false } } });
  assert.equal((await done(x)).code, "MISSING", "payment ack still missing");
  assert.equal(db.getActiveProposal(a).signed_name, null);
  S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { acks: { terms: true, payment: true } } });
  assert.ok((await done(x)).ok, "now complete");
});

test("an edit (revision) voids the open session; a signed version's documents stay in history on v+1", async () => {
  const a = project("Done Nine", "5552220009"); sent(a);
  const open = S.startSession({ accessId: a, optKey: "A", caller: pin(a) });
  db.reviseProposal(a, "Office");
  assert.equal((await K.completeSession({ token: open.token, accessId: a, caller: pin(a) })).code, "VOID");

  const x = await ready("Done Ten", "5552220010");
  const r = await done(x);
  const signedId = r.signedDocId;
  db.reviseProposal(x.a, "Office");                                        // customer requested a change → v2 draft
  const v2 = db.getActiveProposal(x.a);
  assert.equal(v2.version, 2); assert.equal(v2.signed_doc_id, null); assert.equal(v2.sign_status, null);
  assert.equal(store.getDocumentInfo(signedId).voided, false, "v1 signed PDF + certificate remain as history");
});

test("office voiding the signature voids the stored signed PDF + certificate (record preserved)", async () => {
  const x = await ready("Done Eleven", "5552220011");
  const r = await done(x);
  const cert = store.getDocumentInfo(store.getDocumentInfo(r.signedDocId).meta.certificateDocId);
  db.voidProposalSignature(x.a);
  assert.equal(store.getDocumentInfo(r.signedDocId).voided, true);
  assert.equal(store.getDocumentInfo(cert.id).voided, true);
  assert.equal(db.getActiveProposal(x.a).signed_doc_id, null);
  assert.equal(db.getActiveProposal(x.a).signed_name, null);
  assert.ok(store.getDocument(r.signedDocId).bytes.length > 1000, "bytes still there");
});

test("signed PDF + certificate are served through the read gate (owner yes, stranger no)", async () => {
  const x = await ready("Done Twelve", "5552220012");
  const other = project("Done Stranger", "5552220013");
  const r = await done(x);
  const ck = async (a, role = "customer") => `iot_access=${await auth.makeAccessToken(a, role)}`;
  const own = await serve.serveSignDocument(r.signedDocId, await ck(x.a));
  assert.equal(own.status, 200);
  assert.equal(store.sha256Hex(own.body), r.signedSha256);
  const cert = await serve.serveSignDocument(r.signedDocId, await ck(x.a), { certificate: true });
  assert.equal(cert.status, 200);
  assert.match(cert.headers["Content-Disposition"], /Certificate/);
  assert.equal((await serve.serveSignDocument(r.signedDocId, await ck(other))).status, 404);
  assert.equal((await serve.serveSignDocument(r.signedDocId, await ck(other), { certificate: true })).status, 404);
  assert.equal((await serve.serveSignDocument(r.signedDocId, "", { certificate: true })).status, 404);
});

test("a name with characters Helvetica can't encode doesn't break signing", async () => {
  const a = project("Done Unicode", "5552220014"); sent(a);
  const r = S.startSession({ accessId: a, optKey: "A", caller: pin(a) });
  S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { name: "Zoë Łukasz 山田", signature: { method: "upload", data: SIG }, acks: ACKS } });
  const out = await K.completeSession({ token: r.token, accessId: a, caller: pin(a) });
  assert.ok(out.ok, out.error);
  assert.match((await pageTexts(store.getDocument(out.signedDocId).bytes)).at(-1), /Zo/);
});

test("multi-option proposal: signing B signs ONLY B (document narrowed to the option, other option untouched)", async () => {
  const a = project("Done TwoOpts", "5552220015");
  const two = { options: [PAYLOAD.options[0], { id: "B", name: "Alternative Option", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i2", name: "Doorbell Camera", qty: 2, price: 220 }] }] }] };
  db.saveProposalDraft(a, { payload: two, taxRate: 0, depositPct: 50 }, "T"); db.markProposalSent(a, "T");
  const r = S.startSession({ accessId: a, optKey: "B", caller: pin(a) });
  assert.ok(r.ok, r.error);
  assert.ok(r.doc.meta.fields.every((f) => f.opt === "B"));
  S.saveValues({ token: r.token, accessId: a, caller: pin(a), patch: { name: "Pat Doe", signature: { method: "draw", data: SIG }, acks: ACKS } });
  const out = await K.completeSession({ token: r.token, accessId: a, caller: pin(a) });
  assert.ok(out.ok, out.error);
  const p = db.getActiveProposal(a);
  assert.deepEqual(JSON.parse(p.accepted_options), ["B"]);
  const txt = (await pageTexts(store.getDocument(out.signedDocId).bytes)).join(" ");
  assert.match(txt, /Doorbell Camera/);
  assert.doesNotMatch(txt, /Camera Location|\bCamera\b.*\$150/, "option A's lines are not in the document the customer signed");
});

test("mid-completion version bump aborts instead of signing the wrong version (identical-fingerprint v+1)", async () => {
  const x = await ready("Done Race Rev", "5552220016");
  const v1 = db.getActiveProposal(x.a);
  const p = K.completeSession({ token: x.token, accessId: x.a, caller: pin(x.a) });   // runs sync up to the first await (the dry-run flatten)
  db.reviseProposal(x.a, "Office");                                                   // …and v+1 (same payload → same fingerprint) lands in that gap
  const out = await p;
  assert.equal(out.ok, false);
  assert.equal(out.code, "VOID");
  const v2 = db.getActiveProposal(x.a);
  assert.equal(v2.version, 2);
  assert.equal(v2.signed_name, null, "the new version was NOT signed");
  assert.equal(db.sqliteHandle().prepare("SELECT signed_name FROM proposals WHERE id=?").get(v1.id).signed_name, null, "nor the old one");
  assert.equal(db.sqliteHandle().prepare("SELECT COUNT(*) c FROM sign_documents WHERE proposal_id IN (?,?) AND kind IN ('signed','certificate')").get(v1.id, v2.id).c, 0);
  assert.equal(db.sqliteHandle().prepare("SELECT state FROM sign_sessions WHERE doc_id=?").get(x.unsignedId).state, "void");
  assert.equal((await done(x)).code, "VOID", "the token can't be retried");
});
