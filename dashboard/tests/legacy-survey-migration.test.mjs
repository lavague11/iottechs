// B11 / O·161 — the one-time legacy-survey migration. Owner-approved 2026-11-16: convert legacy
// `survey` blobs into real `survey2` rows, because the read-time adapter cannot reach the widget
// without the widget writing the row back anyway. Decisions are pure and live here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSurveyMigration, migrationPayload, summarizeSurveyMigration, surveyMigrationReport, SKIP } from "../lib/legacy-survey-migration.js";
import { legacySurveyToSurvey2 } from "../lib/survey2-model.js";

const legacy = { floors: [{ name: "Floor Plan 1", B: { bg: "image", img: "data:image/jpeg;base64,AAAA", imgSource: "upload", imgRatio: 1.41 },
  markers: [{ id: 22, mode: "in", kind: "cam", x: 44.36, y: 50.21, _tag: "IC1" }] }] };
const adapted = legacySurveyToSurvey2(legacy);
const snap = (over = {}) => ({ accessId: "ASC0001", legacyRaw: JSON.stringify(legacy), survey2HasData: false,
  adapted, legacyFp: "LEGFP", newFp: "NEWFP", approvalFingerprint: null, ...over });

test("a legacy survey with a background converts, counting its floors and devices", () => {
  const p = planSurveyMigration(snap());
  assert.equal(p.action, "convert");
  assert.equal(p.floors, 1);
  assert.equal(p.devices, 1);
  assert.equal(p.rebind, false);
});

test("nothing is converted twice, and markers without a plan are not a survey", () => {
  assert.equal(planSurveyMigration(snap({ survey2HasData: true })).reason, SKIP.HAS_SURVEY2);
  assert.equal(planSurveyMigration(snap({ legacyRaw: null })).reason, SKIP.NO_LEGACY);
  // the real shape of 34 of the 38 legacy rows in this database: markers, no background image
  const noBg = { floors: [{ name: "F", B: { bg: "blank", img: null }, markers: [{ id: 1, kind: "cam", x: 10, y: 10 }] }] };
  assert.equal(planSurveyMigration(snap({ adapted: legacySurveyToSurvey2(noBg) })).reason, SKIP.NOT_ADAPTABLE);
  assert.equal(planSurveyMigration(snap({ adapted: null })).reason, SKIP.NOT_ADAPTABLE);
});

// The one that protects a customer: getToolMeta falls back to the legacy tool for a project with no
// survey2, so an approval is bound to the LEGACY fingerprint. Writing a survey2 row flips which tool
// the gate reads, and a silent conversion would void the approval.
test("a project whose live approval would be voided is HELD BACK, not converted", () => {
  const p = planSurveyMigration(snap({ approvalFingerprint: "LEGFP" }));
  assert.equal(p.action, "skip");
  assert.equal(p.reason, SKIP.WOULD_VOID_APPROVAL);
  assert.equal(p.floors, 1, "it still reports what it would have converted");
});

test("an approval that already drifted is not the migration's problem, and one that survives is fine", () => {
  // bound to neither fingerprint → already broken before the migration
  assert.equal(planSurveyMigration(snap({ approvalFingerprint: "SOMETHINGELSE" })).action, "convert");
  // bound to the NEW fingerprint already → conversion changes nothing for it
  assert.equal(planSurveyMigration(snap({ approvalFingerprint: "NEWFP" })).action, "convert");
  assert.equal(planSurveyMigration(snap({ approvalFingerprint: null })).action, "convert");
});

test("--rebind-approvals converts the held-back ones and marks the re-bind explicitly", () => {
  const p = planSurveyMigration(snap({ approvalFingerprint: "LEGFP" }), { rebindApprovals: true });
  assert.equal(p.action, "convert");
  assert.equal(p.rebind, true);
  assert.equal(p.newFp, "NEWFP", "the script needs the new fingerprint to re-bind to");
  // it only re-binds where a re-bind is actually needed
  assert.equal(planSurveyMigration(snap({ approvalFingerprint: null }), { rebindApprovals: true }).rebind, false);
  assert.equal(planSurveyMigration(snap({ approvalFingerprint: "NEWFP" }), { rebindApprovals: true }).rebind, false);
});

// `__legacyAdapted` is the marker the outbound sync gate refuses. Persisting it would make the
// migrated project permanently unsaveable — every future edit silently dropped.
test("the stored payload never carries the __legacyAdapted marker", () => {
  assert.match(JSON.stringify(adapted), /__legacyAdapted/, "the in-memory adapter output is marked");
  const payload = migrationPayload(adapted);
  assert.doesNotMatch(payload, /__legacyAdapted/, "what gets stored is not");
  assert.deepEqual(Object.keys(JSON.parse(payload)), ["floors"]);
  assert.equal(JSON.parse(payload).floors[0].devices[0].x, 44.36, "and the geometry is intact");
  assert.equal(migrationPayload(null), null);
});

test("the summary and the report say what happened, including the rollback", () => {
  const plans = [planSurveyMigration(snap()), planSurveyMigration(snap({ accessId: "ASC0002", survey2HasData: true })),
    planSurveyMigration(snap({ accessId: "ASC0003", approvalFingerprint: "LEGFP" }))];
  const s = summarizeSurveyMigration(plans);
  assert.equal(s.total, 3); assert.equal(s.convert, 1); assert.equal(s.skip, 2);
  assert.equal(s.byReason[SKIP.WOULD_VOID_APPROVAL], 1);
  const md = surveyMigrationReport(plans, { applied: false, db: "/tmp/x.db" });
  assert.match(md, /DRY RUN/);
  assert.match(md, /\| ASC0001 \| 1 \| 1 \|/, "the converted list names the project");
  assert.match(md, /ASC0003 \| a current survey approval/, "and the held-back list says why");
  assert.match(md, /DELETE FROM project_tool_data WHERE project_access_id = '<id>' AND tool = 'survey2'/, "rollback is written down");
  assert.match(surveyMigrationReport(plans, { applied: true, db: "x" }), /APPLIED/);
});

test("the script is dry-run by default and refuses --apply without a backup", () => {
  const s = readFileSync(new URL("../scripts/migrate-legacy-surveys.mjs", import.meta.url), "utf8");
  assert.match(s, /if \(APPLY && !CONFIRMED\)/, "--apply needs --i-have-a-backup");
  assert.match(s, /if \(APPLY\) \{/, "writes happen only under --apply");
  assert.match(s, /REFUSED: that is the LIVE database/, "a dry run will not silently open the live file");
  assert.match(s, /saveToolData\(plan\.accessId, "survey2", payload, "legacy-survey-migration"\)/, "writes are attributed to the migration");
  assert.doesNotMatch(s, /DELETE|deleteToolData|saveToolData\([^)]*"survey"[^2]/, "the legacy row is never touched");
});
