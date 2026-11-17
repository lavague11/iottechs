// B11 / O·161 — one-time migration of LEGACY survey blobs onto the current survey2 model.
//
// Why a write at all. The read-time adapter (lib/survey2-model.legacySurveyToSurvey2) covers every
// server-side renderer, but it cannot cover the survey WIDGET: the widget is seeded from
// /api/tool-data, and seeding it is not read-only — it uploads the data-URL background to /api/media,
// rewrites `bg`, re-serialises its own state and autosyncs the result, which creates a survey2 row
// anyway. Feeding it an adapted blob is therefore a migration write arriving by accident. The owner's
// decision (2026-11-16) is to do it deliberately instead.
//
// This module is PURE: it decides, it does not write. The script (scripts/migrate-legacy-surveys.mjs)
// assembles each project's snapshot and performs the writes, dry-run by default.
//
// What the migration does NOT do:
//   · it never touches the legacy `survey` row — that stays as the source and the rollback;
//   · it never converts a project that already has a survey2 row of its own;
//   · it never converts a blob with no renderable background (markers with no image are not a plan);
//   · it never voids a customer's survey approval. getToolMeta falls back to the legacy tool for a
//     project with no survey2, so the approval is bound to the LEGACY fingerprint; writing a survey2
//     row flips which tool the gate reads and the binding no longer matches. Those projects are held
//     back and listed, unless the owner explicitly re-binds.

import { renderableFloors } from "./survey2-model.js";

export const SKIP = {
  HAS_SURVEY2: "already has its own survey2",
  HAS_SURVEY2_ROW: "a survey2 row already exists (converting would overwrite it)",
  NOT_ADAPTABLE: "no renderable background — nothing to convert",
  WOULD_VOID_APPROVAL: "a current survey/submission binding is on the legacy fingerprint",
  NO_LEGACY: "no legacy survey row",
};

// snapshot: { accessId, legacyRaw, survey2HasData, survey2RowExists, adapted, legacyFp, newFp, bindings }
//   adapted ............ legacySurveyToSurvey2(legacyRaw) output, or null
//   legacyFp / newFp ... toolFingerprint("survey", legacyRaw) / toolFingerprint("survey2", payload)
//   bindings ........... { site_survey, submit_site_survey } — each the fingerprint that acceptance is
//                        bound to, or null. They are DIFFERENT things: `site_survey` is the customer's
//                        approval, `submit_site_survey` is the office's submission marker. They must
//                        never be collapsed into one value (see the note on re-binding below).
export function planSurveyMigration(s = {}) {
  const base = { accessId: s.accessId, action: "skip", reason: null, floors: 0, devices: 0 };
  if (!s.legacyRaw) return { ...base, reason: SKIP.NO_LEGACY };
  if (s.survey2HasData) return { ...base, reason: SKIP.HAS_SURVEY2 };
  // A survey2 row that exists but holds no survey CONTENT is still somebody's state — widget flags,
  // `submitted`, step position. saveToolData is an upsert, so converting would overwrite it and the
  // documented rollback (DELETE the survey2 row) would not bring it back. Leave it alone.
  if (s.survey2RowExists) return { ...base, reason: SKIP.HAS_SURVEY2_ROW };
  // Only RENDERABLE floors count here. The adapter also carries backgroundless floors so their cameras
  // reach the roster, but writing those as a survey2 row would flip `toolHasData("survey2")` for 34
  // projects — and that is what decides WHICH tool getToolMeta reads. (`survey.has` is already true for
  // them via the legacy fallback; it is the tool, the fingerprint and the camera count that move, and
  // a camera count going 0 → N surfaces customer cards.) A migration that moves gates, not one that
  // recovers floor plans.
  const renderable = renderableFloors(s.adapted);
  if (!renderable.length) return { ...base, reason: SKIP.NOT_ADAPTABLE };

  const floors = renderable.length;
  const devices = renderable.reduce((n, f) => n + ((f.devices || []).length), 0);
  // A binding only matters while it still binds; one already adrift from the legacy blob is not
  // something the migration can break. Either binding being live is enough to hold the project back.
  //
  // There is deliberately NO re-bind option. An earlier version had one, and it was unsafe twice over:
  // it read `site_survey || submit_site_survey` into a single value and then always re-accepted
  // `site_survey`, so a project with only an office SUBMISSION marker came out with a customer
  // APPROVAL the customer never gave. And even done correctly it would not last — opening the planner
  // once renames a device ("" → "Camera 1") and swaps the inline background for a media URL, both of
  // which are inside survey2Meaning, so the fingerprint moves again and the re-bound approval voids.
  // A held-back project is re-approved by the customer, not by a script.
  const b = s.bindings || {};
  const live = [b.site_survey, b.submit_site_survey].filter((fp) => fp && fp === s.legacyFp);
  const survives = live.length > 0 && live.every((fp) => fp === s.newFp);
  if (live.length && !survives) return { ...base, reason: SKIP.WOULD_VOID_APPROVAL, floors, devices };

  return { accessId: s.accessId, action: "convert", reason: null, floors, devices, newFp: s.newFp || null };
}

// The bytes to store. `__legacyAdapted` must NOT be persisted: it is the marker the outbound sync gate
// refuses, so a stored copy carrying it would make the project permanently unsaveable.
export function migrationPayload(adapted) {
  const floors = renderableFloors(adapted);
  if (!floors.length) return null;
  return JSON.stringify({ floors });
}

export function summarizeSurveyMigration(plans = []) {
  const out = { total: plans.length, convert: 0, skip: 0, floors: 0, devices: 0, byReason: {} };
  for (const p of plans) {
    if (p.action === "convert") { out.convert++; out.floors += p.floors; out.devices += p.devices; }
    else { out.skip++; out.byReason[p.reason] = (out.byReason[p.reason] || 0) + 1; }
  }
  return out;
}

export function surveyMigrationReport(plans = [], { applied = false, db = "" } = {}) {
  const s = summarizeSurveyMigration(plans);
  const L = [];
  L.push("# Legacy survey migration — " + (applied ? "APPLIED" : "DRY RUN"));
  L.push("");
  L.push(`Database: \`${db}\``);
  L.push("");
  L.push(`- projects examined: **${s.total}**`);
  L.push(`- would convert: **${s.convert}** (${s.floors} floor(s), ${s.devices} device(s))`);
  L.push(`- held back: **${s.skip}**`);
  L.push("");
  if (s.skip) {
    L.push("## Held back");
    L.push("");
    for (const [reason, n] of Object.entries(s.byReason)) L.push(`- ${reason} — **${n}**`);
    L.push("");
  }
  const conv = plans.filter((p) => p.action === "convert");
  if (conv.length) {
    L.push("## " + (applied ? "Converted" : "Would convert"));
    L.push("");
    L.push("| project | floors | devices |");
    L.push("|---|---:|---:|");
    for (const p of conv) L.push(`| ${p.accessId} | ${p.floors} | ${p.devices} |`);
    L.push("");
  }
  const held = plans.filter((p) => p.action === "skip" && p.reason !== SKIP.HAS_SURVEY2 && p.reason !== SKIP.NO_LEGACY);
  if (held.length) {
    L.push("## Held back, in detail");
    L.push("");
    L.push("| project | reason | floors | devices |");
    L.push("|---|---|---:|---:|");
    for (const p of held) L.push(`| ${p.accessId} | ${p.reason} | ${p.floors} | ${p.devices} |`);
    L.push("");
  }
  L.push("## Rollback");
  L.push("");
  L.push("The legacy `survey` row is never touched. To undo a conversion, delete the project's");
  L.push("`survey2` row — the read-time adapter takes over again and the project renders exactly as it");
  L.push("did before:");
  L.push("");
  L.push("```sql");
  L.push("DELETE FROM project_tool_data WHERE project_access_id = '<id>' AND tool = 'survey2';");
  L.push("```");
  return L.join("\n") + "\n";
}
