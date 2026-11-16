// Section O — one-time migration of LEGACY projects onto the new 3-stage model.
//
//   DRY RUN IS THE DEFAULT. It writes docs/migration-report.md and NOTHING else — no project row,
//   no stage, no stamp, no event. The real run requires BOTH --apply and --i-have-a-backup.
//
// IMPORTANT — "dry run" does not mean "read-only connection". Importing lib/db.js and asking it ANY
// question runs the app's own startup pass on first use (ensure-column ALTERs, seed INSERT OR IGNORE,
// address sync, PIN normalisation, the OLD_TO_NEW stage renames). Those are writes. So a dry run
// against the live file still modifies it. This script therefore REFUSES to open the live database
// unless you name a database on the command line (--db / --snapshot) or say --allow-live out loud,
// and it prints the resolved path on every run.
//
// Run from dashboard/:
//   node scripts/migrate-legacy-projects.mjs --snapshot /tmp/iot-rehearsal   # copy the live DB, dry-run on the copy  ← START HERE
//   node scripts/migrate-legacy-projects.mjs --db /tmp/iot-rehearsal         # dry run against an existing copy
//   node scripts/migrate-legacy-projects.mjs --db /tmp/iot-rehearsal --only ASC0041
//   node scripts/migrate-legacy-projects.mjs --allow-live                    # dry run on the LIVE file (accepts the startup writes)
//   node scripts/migrate-legacy-projects.mjs --apply --i-have-a-backup       # THE REAL RUN
//
// All decisions live in lib/legacy-migration.js (pure, tested). This file only assembles each
// project's snapshot from the database — the same reads the /my-projects page performs — and prints.
import { writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const APPLY = has("--apply");
const CONFIRMED = has("--i-have-a-backup");
const ALLOW_LIVE = has("--allow-live");
const ONLY = val("--only");
const OUT = val("--out") || path.join(process.cwd(), "docs", "migration-report.md");
const dbDirArg = val("--db");
const snapArg = val("--snapshot");

if (APPLY && !CONFIRMED) {
  console.error("\n  REFUSED: --apply needs --i-have-a-backup as well.\n  Take a backup (/dev → Backup) and re-run:\n    node scripts/migrate-legacy-projects.mjs --apply --i-have-a-backup\n");
  process.exit(2);
}

// Importing lib/db.js is INERT — the connection is a lazy proxy, opened on the first query — so the
// path can be resolved and judged before anything touches the file.
const db = await import("../lib/db.js");

const liveFile = path.join(db.dbDir(), "dashboard.db");   // resolved with no override applied yet

// --snapshot: copy the live database (.db + its WAL/SHM sidecars, so nothing recent is lost) into a
// throwaway directory and run there. A file copy is a read of the original.
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

// A dry run on the live file is refused unless the operator asked for it explicitly. An environment
// DB_DIR deliberately does NOT count as "explicit": in production that variable IS the live database.
if (onLive && !namedOnCli && !ALLOW_LIVE && !(APPLY && CONFIRMED)) {
  console.error([
    "",
    "  REFUSED: that is the LIVE database, and this would write to it.",
    "  A dry run changes no PROJECT data, but opening the database runs the app's own startup pass",
    "  (ensure-column ALTERs, seed rows, PIN normalisation, legacy stage renames) — those are writes.",
    "",
    "  Rehearse on a copy instead (recommended):",
    `    node scripts/migrate-legacy-projects.mjs --snapshot ${path.join(path.sep === "\\" ? "C:\\temp" : "/tmp", "iot-rehearsal")}`,
    "",
    "  Or accept those startup writes on the live file:",
    "    node scripts/migrate-legacy-projects.mjs --allow-live",
    "",
  ].join("\n"));
  process.exit(3);
}
const { planProject, summarize, applyMigration } = await import("../lib/legacy-migration.js");
const { renderReport } = await import("../lib/legacy-migration-report.js");
const { financeSummary } = await import("../lib/customer-portal.js");
const { proposalFingerprint } = await import("../lib/proposal.js");

// Recompute the PUBLISHED payload's fingerprint, so a drifted signature (payload moved after it was
// signed) can be told apart from a legacy signature that simply never stored one.
function fingerprintNow(pub) {
  try { return proposalFingerprint(pub.payload, pub.tax_rate, pub.deposit_pct); } catch { return null; }
}

const money = (n) => `$${(Math.round((+n || 0) * 100) / 100).toLocaleString("en-US")}`;

// Everything the planner needs, read straight from the database. Mirrors app/my-projects/page.jsx
// (buildStageFacts + survey_submitted + the schedule blob + financeSummary + proposalStarted) and
// adds the legacy forensics: the published proposal's signature binding and the raw payment rows.
function snapshotOf(p) {
  const id = p.access_id;
  const snap = { project: p, now: Date.now(), events: [], assignments: [], fin: null, proposalStarted: false };
  try { snap.facts = db.buildStageFacts(id) || { stage: p.stage }; } catch { snap.facts = { stage: p.stage }; }
  let acc = {};
  try { acc = db.getStageAcceptances(id) || {}; } catch { acc = {}; }
  snap.facts.survey_submitted = !!acc.submit_site_survey;
  snap.surveyApprovedAt = acc.site_survey?.at || null;
  try { snap.surveyHasData = !!db.getToolMeta(id)?.survey?.has; } catch { snap.surveyHasData = false; }
  try { snap.events = JSON.parse(db.getToolData(id, "schedule")?.data || "{}")?.events || []; } catch { snap.events = []; }
  try { snap.assignments = db.getProjectAssignments(id) || []; } catch { snap.assignments = []; }
  try { snap.fin = financeSummary(db.getProjectFinancialState(id), 0); } catch { snap.fin = null; }
  try { snap.proposalStarted = !!db.getActiveProposal(id)?.payload; } catch { snap.proposalStarted = false; }

  // The PUBLISHED proposal only (locked rule) + whether its signature still binds to that payload.
  try {
    const pub = db.getPublishedProposal(id);
    if (pub) {
      snap.published = {
        version: pub.version, status: pub.status, sent_at: pub.sent_at,
        signed_name: pub.signed_name, signed_at: pub.signed_at,
        signed_fingerprint: pub.signed_fingerprint || null,
        fingerprint_now: fingerprintNow(pub),
      };
    } else snap.published = null;
  } catch { snap.published = null; }

  // Payments, verbatim — confirmed vs pending are never merged.
  try {
    const pays = db.getProjectPayments(id);
    const byStatus = {};
    (pays || []).forEach((x) => { const k = x.status || "unknown"; byStatus[k] = (byStatus[k] || 0) + (+x.amount || 0); });
    const parts = Object.entries(byStatus).map(([k, v]) => `${money(v)} ${k}`);
    snap.paymentsSummary = parts.length ? `${(pays || []).length} payment row(s): ${parts.join(", ")}` : "no payment rows";
    const confirmed = (pays || []).filter((x) => x.status === "confirmed").map((x) => x.paid_at || x.created_at).filter(Boolean).sort();
    snap.lastConfirmedPaymentAt = confirmed.length ? confirmed[confirmed.length - 1] : null;
  } catch { snap.paymentsSummary = "payment rows unreadable"; snap.lastConfirmedPaymentAt = null; }

  // Appointments (the schedule blob) — what the customer can actually see.
  const evs = snap.events || [];
  const nextUp = evs.filter((e) => e?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  snap.apptSummary = evs.length
    ? `${evs.length} on file${nextUp.length ? ` · earliest ${nextUp[0].date}${nextUp[0].time ? ` ${nextUp[0].time}` : ""} (${nextUp[0].kind || nextUp[0].title || "appointment"})` : ""}`
    : "none on the schedule blob";

  // A real, dated basis for a completion stamp — never Date.now(). db.completionEvidenceDate is the
  // ONE derivation (existing stamp → human-recorded entry into Completion → last confirmed payment,
  // with backfill/seed/migration-authored transitions excluded because they record when a SCRIPT ran,
  // not when the work finished). The admin override resolves the warranty start the same way, so the
  // two paths cannot disagree. The chosen source travels with the snapshot for the report.
  try {
    const ev = db.completionEvidenceDate(id);
    snap.completionDate = ev.date;
    snap.completionDateSource = ev.source;
  } catch { snap.completionDate = null; snap.completionDateSource = null; }
  return snap;
}

const jobs = (ONLY ? [db.getJobByAccessId(ONLY)].filter(Boolean) : db.getAllJobs()).filter(Boolean);
if (ONLY && !jobs.length) { console.error(`No project ${ONLY}`); process.exit(1); }

const plans = jobs.map((p) => planProject(snapshotOf(p)));
plans.sort((a, b) => String(a.accessId).localeCompare(String(b.accessId)));
const s = summarize(plans);

// --- the write step (no-op unless --apply) -------------------------------------------------------
const result = applyMigration(plans, {
  apply: APPLY && CONFIRMED,
  writeStage: (id, stage) => db.updateStage(id, stage, "legacy migration"),
  stampCompleted: (id, at) => db.markProjectCompleted(id, at),
  log: (id, label) => db.logProjectEvent(id, { kind: "override", label, actor: "legacy migration" }),
});

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, renderReport({
  plans,
  meta: {
    generatedAt: new Date().toISOString(),
    dbPath: val("--label") || dbFile,
    onLive,
    note: val("--note") || null,
    namedCase: val("--named") || "ASC0041",   // section O calls this project out by name
    applied: result.applied,
  },
}), "utf8");

console.log(`\n  ${result.applied ? "APPLIED" : "DRY RUN — database untouched"}`);
console.log(`  scanned ${s.scanned} · would change ${s.change} · already correct ${s.ok} · need a human ${s.manual} · out of scope ${s.skipped}`);
if (Object.keys(s.reasons).length) Object.entries(s.reasons).forEach(([k, n]) => console.log(`     ${k}: ${n}`));
if (result.applied) console.log(`  writes performed: ${result.writes.length}`);
console.log(`  report: ${OUT}`);
// The report is git-ignored on purpose (it embeds customer names, signer names and contract totals),
// so say how to get it back rather than leaving someone hunting for a committed copy.
console.log("  not committed by design — regenerate any time with:");
console.log(`    node scripts/migrate-legacy-projects.mjs --snapshot ${snapArg || (path.sep === "\\" ? "C:\\temp\\iot-rehearsal" : "/tmp/iot-rehearsal")}\n`);
