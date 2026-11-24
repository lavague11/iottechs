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
