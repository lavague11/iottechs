// A SIGNED SURVEY IS A RECORD, NOT A WORKING COPY.
//
// ASC0055's survey was signed off and was still overwritten — twice, the second time 34 seconds after
// it had been restored. A signature that does not bite at the write path is decoration. Once the site
// survey is accepted only an admin may change it, and every refusal is kept with its reason, so a
// silent "my change didn't save" has somewhere to be looked up.
//
// These run the REAL db module against a REAL sqlite file, not a reading of the source.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "signed-survey-"));
const db = await import("../lib/db.js");
// A second connection to the SAME file, so the proposal rule can be set up with real rows rather than
// by mocking the thing under test.
const { DatabaseSync } = await import("node:sqlite");
let _raw = null;
const dbRaw = () => (_raw ||= new DatabaseSync(path.join(db.dbDir(), "dashboard.db")));

// The acceptance and the refusal log are keyed on the access id, so these need no project row —
// which also proves the guard does not quietly depend on one.
const ID = "SIG0001";

test("an unsigned survey is writable by everyone who may edit it", () => {
  for (const role of ["admin", "manager", "sales", "tech"]) {
    assert.equal(db.signedSurveyRefusal(ID, "survey2", role), null, `${role} may write an unsigned survey`);
  }
  assert.equal(db.surveyIsSigned(ID), false);
});

test("once the site survey is accepted, only an admin may write it", () => {
  db.acceptStage(ID, "site_survey", "The Customer", "fp-1");
  assert.equal(db.surveyIsSigned(ID), true);
  assert.equal(db.signedSurveyRefusal(ID, "survey2", "admin"), null, "admin still can");
  for (const role of ["manager", "sales", "tech", "customer", "vendor", "readonly"]) {
    const r = db.signedSurveyRefusal(ID, "survey2", role);
    assert.ok(r, `${role} must be refused`);
    assert.match(r, /signed off/i, "and told why");
  }
  // both survey tools, and nothing else
  assert.ok(db.signedSurveyRefusal(ID, "survey", "tech"), "the legacy survey tool too");
  for (const other of ["mockup", "schedule", "install", "qc"]) {
    assert.equal(db.signedSurveyRefusal(ID, other, "tech"), null, `${other} keeps its own rules`);
  }
});

test("a refusal is recorded with its reason, and the log is append-only", () => {
  const before = db.getSurveyWriteRefusals(ID).length;
  const reason = db.signedSurveyRefusal(ID, "survey2", "tech");
  db.logSurveyWriteRefusal(ID, "survey2", "Tech Person", "tech", reason, 114117);
  db.logSurveyWriteRefusal(ID, "survey2", "Another Tech", "tech", reason, 90);
  const rows = db.getSurveyWriteRefusals(ID);
  assert.equal(rows.length, before + 2, "both kept — nothing is collapsed or overwritten");
  assert.equal(rows[0].actor, "Another Tech", "newest first");
  assert.equal(rows[0].role, "tech");
  assert.match(rows[0].reason, /signed off/i);
  assert.equal(rows[1].bytes, 114117, "the size of the write that was turned away");
  assert.ok(rows[0].created_at, "and when");
});

test("a project with no acceptance at all is untouched by any of this", () => {
  assert.equal(db.surveyIsSigned("NOPE0001"), false);
  assert.equal(db.signedSurveyRefusal("NOPE0001", "survey2", "tech"), null);
  assert.equal(db.surveyLockReason("NOPE0001"), null);
});

// THE SECOND RULE, and the one that actually covers ASC0055. Its survey carries no site_survey
// acceptance; what it has is a SIGNED PROPOSAL. The survey is the thing that proposal was priced and
// drawn from, so editing it afterwards edits the thing under a signature.
// A SIGNED PROPOSAL DOES NOT LOCK THE SURVEY. The proposal is the signed document; the survey is the
// working drawing behind it, and a tech on a live job needs it. The first cut of this guard locked
// both and blocked techs on real jobs. What stops the overwrite is the claim + lease + reconcile
// gates, which apply to every survey whether anything is signed or not — a lock on staff was never
// the thing standing between ASC0055 and its loss.
test("a signed PROPOSAL does NOT lock the survey — staff and techs can still edit", () => {
  const ID2 = "SIG0002";
  assert.equal(db.surveyLockReason(ID2), null, "nothing yet");
  dbRaw().prepare("INSERT INTO proposals (project_access_id, version, status, payload) VALUES (?,1,'draft','{}')").run(ID2);
  assert.equal(db.surveyLockReason(ID2), null, "an UNSIGNED proposal is nothing");
  dbRaw().prepare("UPDATE proposals SET signed_name='The Customer', signed_at=datetime('now','localtime') WHERE project_access_id=?").run(ID2);
  assert.equal(db.surveyLockReason(ID2), "signed_proposal", "the reason is still reported…");
  for (const role of ["admin", "manager", "sales", "tech"]) {
    assert.equal(db.signedSurveyRefusal(ID2, "survey2", role), null, `${role} may still edit a signed-proposal job`);
  }
  // …but the edit is recorded, because it changes the drawing behind a signed document.
  const note = db.signedJobEditNote(ID2, "survey2");
  assert.match(note, /signed proposal/i, "the write is noted");
  db.logSurveyWriteRefusal(ID2, "survey2", "Tech Person", "tech", note, 4096, "allowed");
  const rows = db.getSurveyWriteRefusals(ID2);
  assert.equal(rows[0].outcome, "allowed", "recorded as an allowed edit, not a refusal");
  assert.equal(rows[0].actor, "Tech Person");
  // and a job with nothing signed is not noted at all
  assert.equal(db.signedJobEditNote("NOPE0001", "survey2"), null);
});

test("BOTH write paths record an allowed edit to a signed-proposal job", () => {
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  for (const [src, who] of [[route, "POST /api/tool-data"], [action, "saveToolDataAction"]]) {
    assert.match(src, /signedJobEditNote\(accessId, tool\)/, `${who} asks after saving`);
    assert.match(src, /"allowed"\)/, `${who} records it as allowed`);
  }
});

test("the survey acceptance rule outranks the proposal rule in the reason given", () => {
  const ID3 = "SIG0003";
  dbRaw().prepare("INSERT INTO proposals (project_access_id, version, status, payload, signed_name) VALUES (?,1,'sent','{}','X')").run(ID3);
  db.acceptStage(ID3, "site_survey", "The Customer", "fp-3");
  assert.equal(db.surveyLockReason(ID3), "site_survey_acceptance", "the survey's own sign-off is the nearer reason");
});

// Both write paths, or it is not enforced at all — the same reason the claim guard is checked twice.
test("BOTH write paths refuse a signed survey", () => {
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  for (const [src, who] of [[route, "POST /api/tool-data"], [action, "saveToolDataAction"]]) {
    assert.match(src, /signedSurveyRefusal\(accessId, tool, tok\.role\)/, `${who} asks`);
    assert.match(src, /logSurveyWriteRefusal\(/, `${who} records the refusal`);
    assert.match(src, /signedOff: true/, `${who} tells the client why`);
  }
  // …and it runs BEFORE the staleness machinery, so a signed survey is refused whatever the rev says.
  const iSigned = route.indexOf("signedSurveyRefusal(accessId, tool, tok.role)");
  const iStale = route.indexOf("toolWriteIsStale(accessId, tool, baseRev)");
  assert.ok(iSigned > 0 && iStale > iSigned, "the signature outranks the rev checks");
});
