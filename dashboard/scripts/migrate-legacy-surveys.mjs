// B11 / O·161 — one-time migration of LEGACY survey blobs onto the current survey2 model.
//
//   DRY RUN IS THE DEFAULT. It writes docs/legacy-survey-migration-report.md and nothing else.
//   The real run requires BOTH --apply and --i-have-a-backup.
//
// Same safety contract as scripts/migrate-legacy-projects.mjs, and for the same reason: importing
// lib/db.js and asking it anything runs the app's own startup pass (ensure-column ALTERs, seed rows,
// PIN normalisation, stage renames), which are writes. So even a dry run against the live file
// modifies it, and this script refuses the live file unless you name a database or say so out loud.
//
// Run from dashboard/:
//   node scripts/migrate-legacy-surveys.mjs --snapshot /tmp/iot-rehearsal   # copy the live DB, dry-run on the copy  ← START HERE
//   node scripts/migrate-legacy-surveys.mjs --db /tmp/iot-rehearsal         # dry run against an existing copy
//   node scripts/migrate-legacy-surveys.mjs --db /tmp/iot-rehearsal --only ASC0041
//   node scripts/migrate-legacy-surveys.mjs --allow-live                    # dry run on the LIVE file
//   node scripts/migrate-legacy-surveys.mjs --apply --i-have-a-backup       # THE REAL RUN
//
// Optional:
//   --only <id>            one project
//   --rebind-approvals     ALSO convert projects whose current survey approval is bound to the legacy
//                          fingerprint, re-binding it to the new one. Without this they are held back
//                          and listed, because converting them silently would void a customer's
//                          approval. Think before using it.
//
// What it writes: a `survey2` row per converted project. The legacy `survey` row is never touched —
// it is the source and the rollback (delete the survey2 row and the read-time adapter resumes).
import { writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const APPLY = has("--apply");
const CONFIRMED = has("--i-have-a-backup");
const ALLOW_LIVE = has("--allow-live");
const REBIND = has("--rebind-approvals");
const ONLY = val("--only");
const OUT = val("--out") || path.join(process.cwd(), "docs", "legacy-survey-migration-report.md");
const dbDirArg = val("--db");
const snapArg = val("--snapshot");

if (APPLY && !CONFIRMED) {
  console.error("\n  REFUSED: --apply needs --i-have-a-backup as well.\n  Take a backup (/dev → Backup) and re-run:\n    node scripts/migrate-legacy-surveys.mjs --apply --i-have-a-backup\n");
  process.exit(2);
}

const db = await import("../lib/db.js");
const liveFile = path.join(db.dbDir(), "dashboard.db");

if (snapArg) {
  mkdirSync(snapArg, { recursive: true });
  for (const sfx of ["", "-wal", "-shm"]) {
    const src = liveFile + sfx;
    if (existsSync(src)) copyFileSync(src, path.join(snapArg, "dashboard.db" + sfx));
  }
  process.env.DB_DIR = snapArg;
} else if (dbDirArg) {
  process.env.DB_DIR = dbDirArg;
}

const dbFile = path.join(db.dbDir(), "dashboard.db");
const onLive = path.resolve(dbFile) === path.resolve(liveFile);
const namedOnCli = !!(snapArg || dbDirArg);
console.log(`\n  database: ${dbFile}${onLive ? "   ← LIVE" : ""}`);
if (existsSync(dbFile)) { const st = statSync(dbFile); console.log(`  file:     ${st.size} bytes · mtime ${st.mtime.toISOString()}`); }

if (onLive && !namedOnCli && !ALLOW_LIVE && !(APPLY && CONFIRMED)) {
  console.error([
    "",
    "  REFUSED: that is the LIVE database, and this would write to it.",
    "  Rehearse on a copy instead (recommended):",
    `    node scripts/migrate-legacy-surveys.mjs --snapshot ${path.join(path.sep === "\\" ? "C:\\temp" : "/tmp", "iot-rehearsal")}`,
    "",
    "  Or accept the startup writes on the live file:",
    "    node scripts/migrate-legacy-surveys.mjs --allow-live",
    "",
  ].join("\n"));
  process.exit(3);
}

const { planSurveyMigration, migrationPayload, summarizeSurveyMigration, surveyMigrationReport } =
  await import("../lib/legacy-survey-migration.js");
const { legacySurveyToSurvey2 } = await import("../lib/survey2-model.js");
const { toolFingerprint, toolHasData } = await import("../lib/tool-data.js");

// Every project that has a legacy survey row. The decision about each one is the pure module's.
const all = db.getAllJobs();
const subject = ONLY ? all.filter((p) => String(p.access_id).toUpperCase() === String(ONLY).toUpperCase()) : all;
const plans = [];
for (const p of subject) {
  const aid = p.access_id;
  const legacyRaw = db.getToolData(aid, "survey")?.data || null;
  if (!legacyRaw) continue;                                     // not a legacy project at all
  const s2 = db.getToolData(aid, "survey2")?.data || null;
  const adapted = legacySurveyToSurvey2(legacyRaw);
  const payload = migrationPayload(adapted);
  let approvalFingerprint = null;
  try {
    const acc = db.getStageAcceptances(aid) || {};
    approvalFingerprint = (acc.site_survey || acc.submit_site_survey || {}).fingerprint || null;
  } catch { /* no acceptances — unapproved */ }
  plans.push(planSurveyMigration({
    accessId: aid,
    legacyRaw,
    survey2HasData: toolHasData("survey2", s2),
    adapted,
    legacyFp: toolFingerprint("survey", legacyRaw),
    newFp: payload ? toolFingerprint("survey2", payload) : null,
    approvalFingerprint,
  }, { rebindApprovals: REBIND }));
}

const sum = summarizeSurveyMigration(plans);
console.log(`\n  projects with a legacy survey: ${sum.total}`);
console.log(`  ${APPLY ? "converting" : "would convert"}:                   ${sum.convert}  (${sum.floors} floor(s), ${sum.devices} device(s))`);
console.log(`  held back:                     ${sum.skip}`);
for (const [r, n] of Object.entries(sum.byReason)) console.log(`      ${n} × ${r}`);
if (sum.rebinds) console.log(`  approvals re-bound:            ${sum.rebinds}`);

// --- the write step (no-op unless --apply) -------------------------------------------------------
if (APPLY) {
  let done = 0;
  for (const plan of plans) {
    if (plan.action !== "convert") continue;
    const legacyRaw = db.getToolData(plan.accessId, "survey")?.data;
    const payload = migrationPayload(legacySurveyToSurvey2(legacyRaw));
    if (!payload) continue;
    db.saveToolData(plan.accessId, "survey2", payload, "legacy-survey-migration");
    if (plan.rebind && plan.newFp) {
      // Only reached with --rebind-approvals: keep the customer's approval attached to the identical
      // content in its new shape, rather than silently dropping it.
      try { db.acceptStage(plan.accessId, "site_survey", "legacy-survey-migration", plan.newFp); }
      catch (e) { console.log(`      ! ${plan.accessId}: approval re-bind failed — ${e.message}`); }
    }
    done++;
  }
  console.log(`\n  WROTE ${done} survey2 row(s). The legacy rows were not touched.`);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, surveyMigrationReport(plans, { applied: APPLY, db: dbFile }), "utf8");
console.log(`\n  report: ${OUT}\n`);
