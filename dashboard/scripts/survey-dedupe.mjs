// D1 — find (and, only when explicitly told to, repair) duplicate device tags and names in stored
// surveys. See docs/survey-rules.md, Identity.
//
// Background: before the Group 1 fix the next ordinal was a COUNT, so deleting a device freed a
// number the next add re-issued — two devices ending up as "IC5 / Camera 4". Those duplicates are
// still in saved surveys. They reach the customer layout and the proposal PDF through
// lib/survey2-model.js, which passes `tag` straight through as the device code.
//
// SAFETY, in order of importance:
//   1. DRY RUN BY DEFAULT. It writes nothing unless --apply is passed.
//   2. A SIGNED SURVEY IS NEVER TOUCHED. survey2Meaning hashes `name`, so a rename moves the
//      fingerprint a customer signature is bound to. Any stage_acceptances row for `site_survey`
//      disqualifies the project — even a stale one, because it records a signature that happened.
//      A blob marked `submitted` is excluded too.
//   3. Hand-typed names are never renumbered. "Front Door" is somebody's words, not an ordinal.
//   4. Only the LATER duplicate moves. The first occurrence keeps its identity.
//
// Usage:
//   node scripts/survey-dedupe.mjs                     dry run against ./data/dashboard.db
//   node scripts/survey-dedupe.mjs --db <path>         dry run against another copy
//   node scripts/survey-dedupe.mjs --apply             write the renames (after a backup)
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dbArg = args.indexOf("--db");
const DB = dbArg >= 0 ? args[dbArg + 1] : path.join(process.cwd(), "data", "dashboard.db");

if (!fs.existsSync(DB)) { console.error("no database at " + DB); process.exit(1); }
const db = new DatabaseSync(DB, { readOnly: !APPLY });

// ---------------------------------------------------------------- helpers

// "IC5" → { letter:"C", n:5 }. Tags are system identity: always safe to renumber.
const TAG_RE = /^(I)([A-Za-z])(\d+)$/;
// "Camera 4" → { prefix:"Camera", n:4 }. A name WITHOUT a trailing number is hand-typed.
const NAME_RE = /^(.*\S)\s+(\d+)$/;

function parseTag(t) { const m = TAG_RE.exec(String(t || "")); return m ? { letter: m[2], n: +m[3] } : null; }
function parseName(s) { const m = NAME_RE.exec(String(s || "")); return m ? { prefix: m[1], n: +m[2] } : null; }

function allDevices(blob) {
  const out = [];
  (blob.floors || []).forEach((f, fi) => (f.devices || []).forEach((d, di) => out.push({ d, fi, di })));
  return out;
}

// ---------------------------------------------------------------- the scan

const rows = db.prepare(
  "SELECT project_access_id AS id, data, updated_at FROM project_tool_data WHERE tool='survey2' ORDER BY project_access_id").all();

const accept = db.prepare(
  "SELECT stage, fingerprint, created_at FROM stage_acceptances WHERE project_access_id=? COLLATE NOCASE").all.bind(
  db.prepare("SELECT stage, fingerprint, created_at FROM stage_acceptances WHERE project_access_id=? COLLATE NOCASE"));

const proposalSigned = db.prepare(
  "SELECT COUNT(*) n FROM proposals WHERE project_access_id=? COLLATE NOCASE AND signed_fingerprint IS NOT NULL AND signed_fingerprint<>''");

const projectName = db.prepare("SELECT company_name, contact_name FROM projects WHERE access_id=? COLLATE NOCASE");

const report = [];
for (const row of rows) {
  let blob; try { blob = JSON.parse(row.data); } catch { continue; }
  if (!blob || !Array.isArray(blob.floors)) continue;

  const devs = allDevices(blob);
  if (!devs.length) continue;

  // --- duplicates -------------------------------------------------------
  const byTag = new Map(), byName = new Map();
  for (const rec of devs) {
    const t = String(rec.d.tag || ""), n = String(rec.d.name || "");
    if (t) { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(rec); }
    if (n) { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(rec); }
  }
  const dupTags = [...byTag.entries()].filter(([, v]) => v.length > 1);
  const dupNames = [...byName.entries()].filter(([, v]) => v.length > 1);
  if (!dupTags.length && !dupNames.length) continue;

  // --- is it signed? ----------------------------------------------------
  const acc = accept(String(row.id));
  const surveyAcc = acc.filter((a) => a.stage === "site_survey");
  const submitted = blob.submitted === true;
  const signedProposals = (proposalSigned.get(String(row.id)) || {}).n || 0;
  const locked = surveyAcc.length > 0 || submitted;

  // --- what each rename would be ---------------------------------------
  // Highest ordinal in use + 1, the same rule the widget now mints with. Only the LATER duplicate
  // moves, and the counters advance as we go so two renames never collide with each other.
  const maxTag = new Map();   // letter → highest n
  const maxName = new Map();  // prefix → highest n
  for (const { d } of devs) {
    const t = parseTag(d.tag); if (t) maxTag.set(t.letter, Math.max(maxTag.get(t.letter) || 0, t.n));
    const n = parseName(d.name); if (n) maxName.set(n.prefix, Math.max(maxName.get(n.prefix) || 0, n.n));
  }

  const changes = [], skipped = [];
  const seenTag = new Set(), seenName = new Set();
  for (const rec of devs) {
    const { d, fi, di } = rec;
    const where = `floor ${fi + 1} #${di + 1}`;
    const change = { where, kind: d.k, cid: d.cid || null };

    const t = String(d.tag || "");
    if (t) {
      if (!seenTag.has(t)) seenTag.add(t);
      else {
        const p = parseTag(t);
        if (!p) skipped.push(`${where}: duplicate tag "${t}" does not match the IC<n> shape — left alone`);
        else { const next = (maxTag.get(p.letter) || 0) + 1; maxTag.set(p.letter, next);
          change.tagFrom = t; change.tagTo = "I" + p.letter + next; }
      }
    }
    const nm = String(d.name || "");
    if (nm) {
      if (!seenName.has(nm)) seenName.add(nm);
      else {
        const p = parseName(nm);
        if (!p) skipped.push(`${where}: duplicate name "${nm}" is hand-typed — never renumbered`);
        else { const next = (maxName.get(p.prefix) || 0) + 1; maxName.set(p.prefix, next);
          change.nameFrom = nm; change.nameTo = p.prefix + " " + next; }
      }
    }
    if (change.tagFrom || change.nameFrom) changes.push(change);
  }

  const who = projectName.get(String(row.id)) || {};
  report.push({ id: row.id, label: who.company_name || who.contact_name || "", updated: row.updated_at,
    devices: devs.length, dupTags: dupTags.map(([t, v]) => `${t} ×${v.length}`),
    dupNames: dupNames.map(([n, v]) => `${n} ×${v.length}`),
    locked, surveyAcc: surveyAcc.length, submitted, signedProposals, changes, skipped });
}

// ---------------------------------------------------------------- output

const touchable = report.filter((r) => !r.locked && r.changes.length);
const lockedOnes = report.filter((r) => r.locked);

console.log(`\nDatabase: ${DB}`);
console.log(`survey2 rows scanned: ${rows.length}`);
console.log(`surveys with a duplicate tag or name: ${report.length}`);
console.log(`  would be repaired: ${touchable.length}`);
console.log(`  SIGNED or SUBMITTED, never touched: ${lockedOnes.length}`);
console.log(APPLY ? "\n*** APPLY MODE — writing changes ***\n" : "\nDRY RUN — nothing is written.\n");

for (const r of report) {
  const lock = r.locked
    ? `LOCKED (${r.surveyAcc ? r.surveyAcc + " site_survey acceptance" : ""}${r.surveyAcc && r.submitted ? ", " : ""}${r.submitted ? "blob submitted" : ""}) — SKIPPED`
    : "unsigned";
  console.log(`${r.id}${r.label ? "  " + r.label : ""}   [${lock}]`);
  console.log(`   devices ${r.devices} · last saved ${r.updated}` +
    (r.signedProposals ? `  · note: ${r.signedProposals} signed proposal(s) on this project` : ""));
  if (r.dupTags.length) console.log(`   duplicate tags:  ${r.dupTags.join(", ")}`);
  if (r.dupNames.length) console.log(`   duplicate names: ${r.dupNames.join(", ")}`);
  for (const c of r.changes) {
    const bits = [];
    if (c.tagFrom) bits.push(`tag ${c.tagFrom} -> ${c.tagTo}`);
    if (c.nameFrom) bits.push(`name "${c.nameFrom}" -> "${c.nameTo}"`);
    console.log(`     ${r.locked ? "(would skip) " : ""}${c.where} [${c.kind}]  ${bits.join("  ·  ")}`);
  }
  for (const s of r.skipped) console.log(`     ${s}`);
  console.log("");
}

if (!APPLY) { console.log("Run with --apply to write ONLY the unsigned ones. Back up first."); process.exit(0); }

// ---------------------------------------------------------------- apply

let written = 0;
const upd = db.prepare("UPDATE project_tool_data SET data=?, updated_at=datetime('now','localtime') WHERE project_access_id=? AND tool='survey2'");
for (const r of touchable) {
  const row = rows.find((x) => x.id === r.id);
  const blob = JSON.parse(row.data);
  const devs = allDevices(blob);
  for (const c of r.changes) {
    const [, fi, di] = /floor (\d+) #(\d+)/.exec(c.where).map(Number);
    const rec = devs.find((x) => x.fi === fi - 1 && x.di === di - 1);
    if (!rec) continue;
    if (c.tagFrom && rec.d.tag === c.tagFrom) rec.d.tag = c.tagTo;
    if (c.nameFrom && rec.d.name === c.nameFrom) rec.d.name = c.nameTo;
  }
  upd.run(JSON.stringify(blob), String(r.id));
  written++;
  console.log(`wrote ${r.id}`);
}
console.log(`\n${written} survey(s) repaired. Signed and submitted surveys were not touched.`);
