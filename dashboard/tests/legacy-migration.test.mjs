// Section O — the one-time legacy migration. Pure tests over lib/legacy-migration.js (the planner)
// and lib/legacy-migration-report.js (the report), plus the source-level guarantees that matter:
// the dry run is the default, the real run needs an explicit flag, and the manual override is
// admin-only. No database is opened by this file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planProject, summarize, applyMigration, classifySignature, depositEvidence, completionStamp, isStampableCompletionDate, SIG } from "../lib/legacy-migration.js";
import { renderReport } from "../lib/legacy-migration-report.js";
import { can, ROLE_KEYS } from "../lib/roles.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// A snapshot shaped exactly like scripts/migrate-legacy-projects.mjs builds it.
function snap({ stage = "inquiry", facts = {}, published = null, project = {}, fin = null, events = [], surveyHasData = false, completionDate = null } = {}) {
  return {
    project: { access_id: "ASC9001", customer: "Test Co", project_type: "A", category: "open", status: "New", stage, ...project },
    facts: { stage, ...facts },
    published, fin, events, surveyHasData, completionDate,
    assignments: [], proposalStarted: false, paymentsSummary: "", apptSummary: "", now: Date.UTC(2026, 10, 16),
  };
}
const SIGNED = { proposal_status: "accepted", proposal_signed: true, survey_accepted: true };

// ---- signature evidence: three different meanings of "unsigned" --------------------------------
test("signature classes separate genuinely-unsigned, bound, drifted and legacy-unbound", () => {
  assert.equal(classifySignature(null), SIG.NONE);
  assert.equal(classifySignature({ signed_name: null }), SIG.NONE);
  assert.equal(classifySignature({ signed_name: "A", signed_fingerprint: "x", fingerprint_now: "x" }), SIG.BOUND);
  assert.equal(classifySignature({ signed_name: "A", signed_fingerprint: "x", fingerprint_now: "y" }), SIG.DRIFTED);
  assert.equal(classifySignature({ signed_name: "A", signed_fingerprint: null, fingerprint_now: "y" }), SIG.LEGACY_UNBOUND);
});

// ---- the headline case: signed proposal, stale stage column ------------------------------------
test("a signed + deposited project stuck at site_survey maps forward to the scheduling stage", () => {
  const p = planProject(snap({
    stage: "site_survey",
    facts: { ...SIGNED, deposit_submitted: true, deposit_recorded: true },
    published: { version: 1, status: "accepted", sent_at: "2026-07-14", signed_name: "James", signed_at: "2026-07-20", signed_fingerprint: "fp", fingerprint_now: "fp" },
  }));
  assert.equal(p.verdict, "change");
  assert.equal(p.proposedStage, "schedule");
  assert.equal(p.write.stage, "schedule");
  assert.equal(p.write.completedAt, null);               // completion is never inferred from a signature
  assert.equal(p.signature, SIG.BOUND);
  // The derived pair was already right (status and the 3-step rail come from the facts, not the
  // column), so this project's visible state does not move — the stale COLUMN is what gets fixed,
  // and that is what the phase gate, auto-advance, the staff deck and the legacy portal read.
  assert.equal(p.current.state, "READY_TO_SCHEDULE");
  assert.equal(p.proposed.state, "READY_TO_SCHEDULE");
  assert.equal(p.visible, false);
  assert.ok(p.evidence.some((e) => /fingerprint matches/.test(e)));
});

test("a signed proposal supersedes a missing survey approval — but never writes to the survey", () => {
  const p = planProject(snap({
    stage: "site_survey", surveyHasData: true,
    facts: { proposal_status: "accepted", proposal_signed: true, survey_submitted: true, survey_accepted: false, deposit_recorded: true },
    published: { version: 1, status: "accepted", signed_name: "J", signed_fingerprint: "fp", fingerprint_now: "fp" },
  }));
  assert.equal(p.proposedStage, "schedule");
  assert.ok(p.notes.some((n) => /superseded/i.test(n)));
  assert.ok(p.evidence.some((e) => /Survey: submitted, NOT approved/.test(e)));
  assert.deepEqual(Object.keys(p.write), ["stage", "completedAt"]);   // stage + stamp are the ONLY writes
  // THIS is the section-O complaint: "Approve site survey" on a signed job → Awaiting Installation.
  assert.equal(p.current.state, "AWAITING_SURVEY_APPROVAL");
  assert.equal(p.proposed.state, "READY_TO_SCHEDULE");
  assert.equal(p.visible, true);
});

// ---- trap 2: a drifted signature is a contract question, never a migration ---------------------
test("a drifted-fingerprint signature needs a human and is never written either way", () => {
  const p = planProject(snap({
    stage: "approval_deposit",
    facts: { proposal_status: "accepted", survey_accepted: true, proposal_signed: false },  // facts read it as UNSIGNED
    published: { version: 3, status: "accepted", signed_name: "Dana", signed_at: "2026-05-01", signed_fingerprint: "old", fingerprint_now: "new" },
  }));
  assert.equal(p.signature, SIG.DRIFTED);
  assert.equal(p.verdict, "manual");
  assert.equal(p.write, null);
  assert.ok(p.needsHuman.some((h) => h.code === "signature_drift"));
  assert.ok(p.evidence.some((e) => /SIGNED BUT DRIFTED/.test(e)));
  assert.equal(applyMigration([p], { apply: true, writeStage: () => assert.fail("must not write"), stampCompleted: () => assert.fail("must not stamp") }).writes.length, 0);
});

test("a legacy signature with no stored fingerprint is trusted but flagged weak", () => {
  const p = planProject(snap({
    stage: "approval_deposit",
    facts: { ...SIGNED, deposit_recorded: true },
    published: { version: 2, status: "accepted", signed_name: "Joe", signed_fingerprint: null, fingerprint_now: "fp" },
  }));
  assert.equal(p.signature, SIG.LEGACY_UNBOUND);
  assert.equal(p.weak, true);
  assert.equal(p.verdict, "change");
  assert.ok(p.evidence.some((e) => /cannot be verified/.test(e)));
});

// ---- trap 3: pending money is not paid money ---------------------------------------------------
test("a submitted-but-unconfirmed deposit is never read as paid", () => {
  assert.equal(depositEvidence({ deposit_submitted: true }).kind, "pending");
  assert.equal(depositEvidence({ deposit_submitted: true, deposit_recorded: true }).kind, "confirmed");
  const p = planProject(snap({
    stage: "approval_deposit",
    facts: { ...SIGNED, deposit_submitted: true, deposit_recorded: false },
    published: { version: 1, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" },
  }));
  assert.equal(p.deposit, "pending");
  assert.equal(p.proposedStage, "approval_deposit");           // the deposit gate still holds
  assert.equal(p.proposed.state, "AWAITING_DEPOSIT");
  assert.equal(p.verdict, "ok");
  assert.ok(p.evidence.some((e) => /NOT confirmed/.test(e)));
});

test("a pending payment on a project already past the deposit gate is escalated, not trusted", () => {
  const p = planProject(snap({
    stage: "schedule",
    facts: { ...SIGNED, deposit_submitted: true, deposit_recorded: false },
    published: { version: 1, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" },
  }));
  assert.equal(p.verdict, "manual");
  assert.ok(p.needsHuman.some((h) => h.code === "deposit_pending_past_gate"));
});

// ---- forward-only, and never beyond the evidence -----------------------------------------------
test("a stage ahead of its evidence is reported, never rewound", () => {
  const p = planProject(snap({ stage: "qc", facts: { survey_accepted: true } }));
  assert.equal(p.verdict, "manual");
  assert.equal(p.proposedStage, "qc");                          // unchanged — no rewind
  assert.equal(p.write, null);
  assert.ok(p.needsHuman.some((h) => h.code === "stage_ahead_of_evidence"));
});

test("a bare lead is never swept into the Proposal stage when no proposal was ever published", () => {
  const p = planProject(snap({ stage: "inquiry", facts: { survey_accepted: true, date: "2026-07-01" }, project: { date: "2026-07-01" } }));
  assert.equal(p.proposedStage, "site_survey");
  assert.ok(p.notes.some((n) => /does not exist/.test(n)));
});

test("a stored stage claiming a proposal that was never published is escalated", () => {
  const p = planProject(snap({ stage: "proposal", facts: { survey_accepted: true } }));
  assert.ok(p.needsHuman.some((h) => h.code === "stage_claims_proposal_without_one"));
});

// ---- completion is never invented ---------------------------------------------------------------
test("a completion stamp needs install + full payment AND a real date", () => {
  assert.equal(completionStamp(snap({ facts: { install_done: true, final_balance_paid: true } })).stamp, null);
  assert.equal(completionStamp(snap({ facts: { install_done: true, final_balance_paid: false }, completionDate: "2026-09-01" })).stamp, null);
  assert.equal(completionStamp(snap({ facts: { install_done: true, final_balance_paid: true }, completionDate: "2026-09-01" })).stamp, "2026-09-01");
  // Already stamped → nothing to do.
  assert.equal(completionStamp(snap({ project: { completed_at: "2026-01-01" }, facts: { install_done: true, final_balance_paid: true }, completionDate: "2026-09-01" })).stamp, null);
});

test("a finished-looking job with no completion stamp is a human decision, not a guessed date", () => {
  const p = planProject(snap({
    stage: "install",
    facts: { ...SIGNED, deposit_recorded: true, install_done: true, install_photos: true, final_balance_paid: true },
    published: { version: 1, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" },
  }));
  assert.ok(p.needsHuman.some((h) => h.code === "completion_stamp_missing"));
  assert.equal(p.verdict, "manual");
  assert.equal(p.write, null);
});

test("Pizza-Bay shape: install done, paid in full and dated evidence → Completion at 100%", () => {
  const p = planProject(snap({
    stage: "install",
    facts: { ...SIGNED, deposit_recorded: true, install_done: true, install_photos: true, qc_manager_approved: true, qc_customer_signed: true, final_balance_paid: true },
    fin: { hasContract: true, total: 1000, paid: 1000, balance: 0, paidInFull: true },
    published: { version: 2, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" },
    completionDate: "2026-09-01",
  }));
  assert.equal(p.verdict, "change");
  assert.equal(p.proposedStage, "completion");
  assert.equal(p.write.completedAt, "2026-09-01");
  assert.equal(p.proposed.state, "COMPLETE");
  assert.equal(p.proposed.pct, 100);
  assert.equal(p.proposed.chip.label, "Completed");
});

// ---- service calls are not on this model --------------------------------------------------------
test("service calls (type C) are skipped, not migrated", () => {
  const p = planProject(snap({ project: { project_type: "C" } }));
  assert.equal(p.verdict, "skipped");
  assert.equal(p.write, undefined);
});

// ---- the dry run writes a report and NOTHING else ------------------------------------------------
test("the dry run performs zero writes — the injected writers are never called", () => {
  const plans = [
    planProject(snap({ stage: "site_survey", facts: { ...SIGNED, deposit_recorded: true }, published: { version: 1, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" } })),
    planProject(snap({ stage: "inquiry", facts: { survey_accepted: true } })),
  ];
  const calls = [];
  const res = applyMigration(plans, { apply: false, writeStage: () => calls.push("stage"), stampCompleted: () => calls.push("stamp"), log: () => calls.push("log") });
  assert.equal(res.applied, false);
  assert.deepEqual(res.writes, []);
  assert.deepEqual(calls, []);
  assert.ok(res.planned >= 1, "it still reports what it WOULD do");
});

test("--apply writes exactly the planned stage/stamp and logs each one", () => {
  const plan = planProject(snap({ stage: "site_survey", facts: { ...SIGNED, deposit_recorded: true }, published: { version: 1, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" } }));
  const calls = [];
  const res = applyMigration([plan], { apply: true, writeStage: (id, s) => calls.push(["stage", id, s]), stampCompleted: (id, d) => calls.push(["stamp", id, d]), log: (id) => calls.push(["log", id]) });
  assert.equal(res.applied, true);
  assert.deepEqual(calls, [["stage", "ASC9001", "schedule"], ["log", "ASC9001"]]);
});

test("the report carries the totals, the per-project before→after and the real-run command", () => {
  const plans = [
    planProject(snap({ stage: "site_survey", facts: { ...SIGNED, deposit_recorded: true }, published: { version: 1, status: "accepted", signed_name: "A", signed_fingerprint: "fp", fingerprint_now: "fp" } })),
    planProject(snap({ stage: "qc", facts: { survey_accepted: true } })),
    planProject(snap({ project: { project_type: "C" } })),
  ];
  const s = summarize(plans);
  assert.deepEqual([s.scanned, s.change, s.manual, s.skipped], [3, 1, 1, 1]);
  const md = renderReport({ plans, meta: { generatedAt: "now", dbPath: "data", applied: false } });
  assert.ok(md.includes("DRY RUN — no project data was written"), "the header states the mode");
  assert.ok(md.includes("| Projects scanned | 3 |"), "totals table counts every project scanned");
  assert.ok(md.includes("**Current:**") && md.includes("**Proposed:**"), "each project prints current → proposed");
  assert.ok(md.includes("Need a human decision"), "the human-decision section exists");
  assert.ok(md.includes("node scripts/migrate-legacy-projects.mjs --apply --i-have-a-backup"), "the real-run command is documented verbatim");
  assert.ok(md.includes("--snapshot /tmp/iot-rehearsal"), "the dry-run command runs on a COPY");
  assert.ok(/A dry run is not a read-only connection/.test(md), "and says why a dry run still writes to the live file");
  assert.ok(md.includes("Closed records are never written forward"), "the closed-record policy is stated");
  assert.ok(md.includes("Projects that look finished but do NOT read Completed"), "the Completed-filter reconciliation is present");
  assert.ok(md.includes("/dev/docs/migration-report.md"), "the doc route includes the .md extension it needs");
  assert.ok(md.includes("deliberately NOT committed"), "and says the report is not committed, with how to regenerate it");
  // The override instructions must name the control a human can click, and the date rule.
  assert.ok(/right-click[^\n]*Override…/.test(md), "the override section names the clickable path");
  assert.ok(md.includes("completedAt"), "and the action signature includes the completion date");
  assert.ok(/completion date is required, and it is never today/i.test(md), "and states the date rule");
  assert.ok(!/pass `completed: true` to stamp the completion date/.test(md), "no stale 'just pass completed:true' instruction");
  // Every changed project gets a full evidence block, not just the ones whose UI moves.
  const blocks = (md.match(/^- \*\*Evidence:\*\*$/gm) || []).length;
  assert.ok(blocks >= s.change + s.manual, `every change and every manual row carries evidence (${blocks} blocks)`);
});

test("an unparseable completion date is refused — it would make the DB stamp TODAY", () => {
  for (const good of ["2026-09-01", "2026-09-01 14:02:11", "2024-02-29", "2026-12-31T23:59:59Z"]) {
    assert.equal(isStampableCompletionDate(good), true, `accepted: ${good}`);
  }
  // Shape alone is not enough — these all match /^\d{4}-\d{2}-\d{2}/ and are all impossible dates.
  for (const bad of ["2026-13-45", "2026-02-30", "2026-00-10", "2026-01-00", "0000-00-00", "9999-99-99",
                     "1999-12-31", "2101-01-01", "2026-01-01extra", "09/01/2026", "Sep 1 2026", "2026-9-1",
                     "", null, undefined, "yesterday", 1756684800000]) {
    assert.equal(isStampableCompletionDate(bad), false, `rejected: ${bad}`);
  }
  assert.equal(isStampableCompletionDate("2026-02-29"), false, "rejected: 2026 is not a leap year");
  const finished = { install_done: true, final_balance_paid: true };
  const bad = completionStamp(snap({ facts: finished, completionDate: "09/01/2026" }));
  assert.equal(bad.stamp, null);
  assert.match(bad.reason, /not a YYYY-MM-DD date/);
  assert.match(bad.reason, /start the warranty clock from today/);

  // And the writer refuses outright, even if a plan somehow carried one.
  const plan = { verdict: "change", accessId: "ASC9001", storedStage: "install", proposedStage: "completion", write: { stage: null, completedAt: "09/01/2026" } };
  assert.throws(() => applyMigration([plan], { apply: true, writeStage: () => {}, stampCompleted: () => assert.fail("must not stamp"), log: () => {} }), /not a real YYYY-MM-DD date/);
});

test("a closed record is never written forward", () => {
  const base = { stage: "inquiry", facts: { survey_accepted: true, date: "2026-07-01" }, project: { date: "2026-07-01" } };
  const open = planProject(snap(base));
  assert.equal(open.verdict, "change");                                  // same row, not closed → moves
  for (const closedRow of [{ lost_at: "2026-08-01", lost_reason: "no answer" }, { category: "closed" }, { status: "closed" }]) {
    const p = planProject(snap({ ...base, project: { ...base.project, ...closedRow } }));
    assert.equal(p.closed, true);
    assert.equal(p.verdict, "ok", JSON.stringify(closedRow));
    assert.equal(p.write, null, "no write to a closed record");
    assert.ok(p.notes.some((n) => /Closed record — NO write/.test(n)));
    assert.ok(p.evidence.some((e) => /^Closed:/.test(e)));
  }
});

test("the survey-visit date is reported as its own line, so the Inquiry gate is checkable", () => {
  const withDate = planProject(snap({ stage: "inquiry", facts: { survey_accepted: true, date: "2026-07-17" }, project: { date: "2026-07-17" } }));
  assert.ok(withDate.evidence.some((e) => /^Survey date \(projects\.date.*: 2026-07-17/.test(e)));
  const noDate = planProject(snap({ stage: "inquiry", facts: { survey_accepted: true } }));
  assert.ok(noDate.evidence.some((e) => /^Survey date .*: EMPTY/.test(e)));
});

test("stage_ahead_of_evidence quotes the CAPPED evidence stage and names what is missing", () => {
  // Sent proposal, survey submitted but never approved, no projects.date: the evidence reaches
  // Site Survey (the date is superseded by the published proposal), not Inquiry.
  const p = planProject(snap({ stage: "proposal", surveyHasData: true, facts: { proposal_status: "sent", survey_submitted: true, survey_accepted: false } }));
  const h = p.needsHuman.find((x) => x.code === "stage_ahead_of_evidence");
  assert.ok(h, "flagged");
  assert.match(h.text, /only reaches Site Survey/);
  assert.match(h.text, /missing customer sign-off/);
  assert.ok(!/only reaches Inquiry/.test(h.text));
  // And a no-proposal row is never told its facts "support Proposal" when the cap forbids it.
  const q = planProject(snap({ stage: "install", facts: { survey_accepted: true, date: "2026-07-01" }, project: { date: "2026-07-01" } }));
  const qh = q.needsHuman.find((x) => x.code === "stage_ahead_of_evidence");
  assert.match(qh.text, /only reaches Site Survey/);
  assert.match(qh.text, /no proposal has ever been published/);
});

// ---- the script itself: dry run by default, real run gated ---------------------------------------
test("the script defaults to a dry run and refuses --apply without the explicit confirmation flag", () => {
  const src = read("scripts/migrate-legacy-projects.mjs");
  assert.ok(/const APPLY = has\("--apply"\)/.test(src), "apply comes from an explicit flag");
  assert.ok(/if \(APPLY && !CONFIRMED\)[\s\S]{0,200}process\.exit\(2\)/.test(src), "--apply without --i-have-a-backup exits");
  assert.ok(/apply: APPLY && CONFIRMED/.test(src), "both flags are required to write");
  // A dry run must not quietly open the live file: opening it at all runs the ensure-column + seed
  // startup pass, which writes. The resolved path is printed and the live file needs an explicit say-so.
  assert.ok(/console\.log\(`\\n  database: \$\{dbFile\}/.test(src), "the resolved database path is printed every run");
  assert.ok(/if \(onLive && !namedOnCli && !ALLOW_LIVE && !\(APPLY && CONFIRMED\)\)[\s\S]{0,1200}process\.exit\(3\)/.test(src), "a dry run on the live file is refused without --db/--snapshot/--allow-live");
  assert.ok(/const liveFile = path\.join\(db\.dbDir\(\), "dashboard\.db"\)/.test(src), "the live path is resolved before any override is applied");
  assert.ok(/db\.completionEvidenceDate\(id\)/.test(src), "the completion date comes from the ONE shared derivation, not an inline query");
  assert.ok(/NOT IN \('backfill'/.test(read("lib/db.js")), "backfill-authored stage transitions are not dated evidence");
  // Every DB mutation must flow through applyMigration's injected writers — no stray writes.
  const strayWrite = /db\.(updateStage|markProjectCompleted|logProjectEvent|advanceStageForward|maybeAutoAdvance)\(/g;
  for (const m of src.matchAll(strayWrite)) {
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    const line = src.slice(lineStart, src.indexOf("\n", m.index));
    assert.ok(/=>/.test(line), `DB write outside the injected writers: ${line.trim()}`);
  }
});

// ---- the override is reachable from the UI, admin-only, and never stamps "today" -----------------
test("the override the report tells the owner to use is actually wired to a control", () => {
  const menu = read("app/components/project-card-menu.jsx");
  const modal = read("app/components/legacy-stage-override.jsx");
  assert.ok(/import LegacyStageOverride from "\.\/legacy-stage-override"/.test(menu), "the card menu imports the dialog");
  assert.ok(/canOverride && \{ label: "Override…"/.test(menu), "and offers it as a menu item");
  assert.ok(/can\(role, "legacy\.override"\)/.test(menu), "gated by capability, not a role string");
  assert.ok(!/isAdmin && \{ label: "Override/.test(menu), "not gated by an ad-hoc admin boolean");
  assert.ok(/setLegacyProjectStateAction\(id, \{/.test(modal), "the dialog calls the server action");
  assert.ok(/getLegacyProjectStateAction/.test(modal), "and opens on real values (current stage + dated evidence)");
  assert.ok(/stagesForType/.test(modal), "with the FULL master-stage list, not the 3 quick targets");
  assert.ok(/type="date"/.test(modal), "a completion date is collected, never assumed");
  assert.ok(/completedAt: needsDate \? date : null/.test(modal), "and passed through to the action");
});

test("marking a legacy job complete requires a real date — the DB never falls back to today", () => {
  const dbSrc = read("lib/db.js");
  const fn = dbSrc.slice(dbSrc.indexOf("export function setLegacyStageOverride"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.ok(/completedAt = null/.test(body), "the function takes a date");
  assert.ok(/completionEvidenceDate\(accessId\)\.date/.test(body), "falling back to DATED evidence, not now()");
  assert.ok(/isStampableCompletionDate\(stampDate\)/.test(body), "validated by the shared calendar check");
  assert.ok(/markProjectCompleted\(accessId, stampDate\)/.test(body), "and the date is actually passed to the writer");
  assert.ok(!/markProjectCompleted\(accessId\)\s*;/.test(body), "never called without a date (that branch stamps today)");
  assert.ok(/needs a completion date/.test(body), "and it refuses with a human-readable reason");
});

// ---- the admin override is admin-only ------------------------------------------------------------
test("legacy.override is admin-only — every other role is refused", () => {
  assert.equal(can("admin", "legacy.override"), true);
  for (const r of ROLE_KEYS.filter((r) => r !== "admin")) assert.equal(can(r, "legacy.override"), false, r);
  assert.equal(can("manager", "stage.move"), true, "a manager still moves stages the normal way");
});

// Behaviour is covered against a real database in tests/legacy-override-db.test.mjs. These are the
// wiring facts a behavioural test cannot see: that the action is server-side and routes its decision
// through the tested gate, and that the DB function audits every applied override.
test("the override action gates on the capability server-side and logs the override", () => {
  const src = read("app/project/[accessId]/legacy-actions.js");
  assert.ok(/"use server"/.test(src));
  assert.ok(/overrideRefusal\(tok, accessId, can\)/.test(src), "routes through the tested gate");
  assert.ok(/if \(refusal\) return \{ error: refusal \}/.test(src), "and returns on refusal, before any write");
  assert.ok(!/role === ["']admin["']/.test(src), "no role string comparison");
  const dbSrc = read("lib/db.js");
  const fn = dbSrc.slice(dbSrc.indexOf("export function setLegacyStageOverride"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.ok(/logProjectEvent\(accessId, \{[\s\S]*kind: "override"/.test(body), "the override is appended to the project event log");
  assert.ok(/updateStage\(accessId, stage/.test(body), "stage moves through updateStage, so a stage_transitions row is recorded");
  assert.ok(/allowed\.has\(stage\)/.test(body), "the target stage must apply to this project type");
});
