// Site Intelligence (Phase 7) — server-side tests. NETWORK-FREE: no OpenAI call, no key required.
// Covers the validator, the reuse decision, the source hash, the DB round-trip, and source-reads
// the route to lock the auth guard / 503 gate / reuse branch / markOutdated wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

// Point the DB at a throwaway dir BEFORE importing lib/db (connection is lazy, so this wins).
process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "iot-siteintel-"));

const site = await import("../lib/site-intel.js");
const { validateSiteIntel, shouldReuseRun, normPolygon, clamp01, siteIntelSourceHash, SITE_INTEL_ZONE_TYPES, siteIntelPrompt } = site;
const db = await import("../lib/db.js");
const { DEFAULT_SITE_INTEL, PROMPT_KEYS } = await import("../lib/survey-prompts.js");

// ---- Validator ------------------------------------------------------------------------------
test("validator: clamps vertices to [0,1] and passes a clean boundary", () => {
  const out = validateSiteIntel({ siteBoundary: { polygon: [[-0.5, 2], [0.3, 0.4], [1.7, -3], [0.1, 0.9]], confidence: 0.8 } });
  assert.deepEqual(out.siteBoundary.polygon, [[0, 1], [0.3, 0.4], [1, 0], [0.1, 0.9]]);
  assert.equal(out.siteBoundary.confidence, 0.8);
});

test("validator: drops polygons with fewer than 3 valid points", () => {
  const out = validateSiteIntel({
    siteBoundary: { polygon: [[0.1, 0.1], [0.2, 0.2]], confidence: 1 },           // 2 pts → dropped
    zones: [{ type: "driveway", polygon: [[0.1, 0.1], ["x", "y"], [null, 0.3]], confidence: 0.5 }], // 1 usable → dropped
  });
  assert.equal(out.siteBoundary, null);
  assert.equal(out.zones.length, 0);
});

test("validator: enforces the zone allow-list", () => {
  const out = validateSiteIntel({ zones: [
    { type: "driveway", polygon: [[0, 0], [1, 0], [1, 1]], confidence: 0.9 },
    { type: "swimming_pool", polygon: [[0, 0], [1, 0], [1, 1]], confidence: 0.9 }, // not allowed → dropped
    { type: "PARKING", polygon: [[0, 0], [1, 0], [0.5, 1]], confidence: 0.4 },      // case-normalized → kept
  ] });
  assert.deepEqual(out.zones.map((z) => z.type), ["driveway", "parking"]);
  assert.equal(SITE_INTEL_ZONE_TYPES.length, 13);
});

test("validator: clamps confidence to [0,1] and defaults missing confidence to 0", () => {
  const out = validateSiteIntel({ zones: [
    { type: "street", polygon: [[0, 0], [1, 0], [1, 1]], confidence: 5 },
    { type: "curb", polygon: [[0, 0], [1, 0], [1, 1]] },
  ] });
  assert.equal(out.zones[0].confidence, 1);
  assert.equal(out.zones[1].confidence, 0);
});

test("validator: accepts {x,y} vertices and never throws on garbage", () => {
  const poly = normPolygon([{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.9 }]);
  assert.deepEqual(poly, [[0.2, 0.2], [0.8, 0.2], [0.5, 0.9]]);
  for (const junk of [null, undefined, 5, "nope", [], {}, { zones: "no" }]) {
    const out = validateSiteIntel(junk);
    assert.equal(out.siteBoundary, null);
    assert.equal(out.orientation, null);
    assert.deepEqual(out.zones, []);
  }
});

test("validator: orientation labels sanitized, confidence clamped; empty orientation → null", () => {
  const out = validateSiteIntel({ orientation: { front: " North\nside ", rear: 42, left: "", confidence: -1 } });
  assert.equal(out.orientation.front, "North side");
  assert.equal(out.orientation.rear, null);  // non-string dropped
  assert.equal(out.orientation.left, null);  // empty dropped
  assert.equal(out.orientation.confidence, 0);
  assert.equal(validateSiteIntel({ orientation: {} }).orientation, null);
});

test("validator: carries runId + sourceRevision from opts", () => {
  const out = validateSiteIntel({}, { runId: "run-123", sourceRevision: 7 });
  assert.equal(out.runId, "run-123");
  assert.equal(out.sourceRevision, 7);
});

test("clamp01: finite clamp, non-finite → null", () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(-2), 0);
  assert.equal(clamp01(9), 1);
  assert.equal(clamp01("x"), null);
  assert.equal(clamp01(Infinity), null);
});

// ---- Reuse decision -------------------------------------------------------------------------
test("shouldReuseRun: done+no-force reuses; force/error/outdated/missing re-analyze", () => {
  assert.equal(shouldReuseRun({ status: "done" }, false), true);
  assert.equal(shouldReuseRun({ status: "done" }, true), false);   // analyzeAgain forces a new call
  assert.equal(shouldReuseRun({ status: "error" }, false), false);
  assert.equal(shouldReuseRun({ status: "outdated" }, false), false);
  assert.equal(shouldReuseRun(null, false), false);
});

// ---- Source hash ----------------------------------------------------------------------------
test("siteIntelSourceHash: stable across key order, changes with image/context", () => {
  const a = siteIntelSourceHash({ image: "IMG", grid: { a: 1, b: 2 }, structure: { x: 1 } });
  const b = siteIntelSourceHash({ image: "IMG", grid: { b: 2, a: 1 }, structure: { x: 1 } }); // reordered keys
  assert.equal(a, b);
  assert.notEqual(a, siteIntelSourceHash({ image: "IMG2", grid: { a: 1, b: 2 }, structure: { x: 1 } }));
  assert.notEqual(a, siteIntelSourceHash({ image: "IMG", grid: { a: 1, b: 2 }, structure: { x: 2 } }));
  assert.match(a, /^[0-9a-f]{64}$/);
});

// ---- Prompt ---------------------------------------------------------------------------------
test("prompt: default used when no vault override; key wired", () => {
  assert.equal(PROMPT_KEYS.SITE_INTEL, "SURVEY_PROMPT_SITE_INTEL");
  assert.equal(siteIntelPrompt(), DEFAULT_SITE_INTEL); // no override stored in the throwaway DB
  assert.match(DEFAULT_SITE_INTEL, /ANALYSIS task ONLY/);
  assert.match(DEFAULT_SITE_INTEL, /NOT a surveyed, legal, recorded, or parcel boundary/);
  // every supported zone type appears in the prompt
  for (const t of SITE_INTEL_ZONE_TYPES) assert.ok(DEFAULT_SITE_INTEL.includes(t), `prompt mentions ${t}`);
});

// ---- DB round-trip --------------------------------------------------------------------------
test("db: save / getByHash (latest done) / getLatest / markOutdated", () => {
  const A = "SITEINTEL1", F = "floor-1", H = "hash-abc";
  const payload = validateSiteIntel({ zones: [{ type: "driveway", polygon: [[0, 0], [1, 0], [1, 1]], confidence: 0.9 }] }, { runId: "r1" });

  const saved = db.saveSiteIntelRun({ id: "r1", accessId: A, floorId: F, sourceHash: H, provider: "openai", model: "gpt-5.4-mini", status: "done", usage: { input_tokens: 10 }, payload, createdBy: "tester" });
  assert.equal(saved.id, "r1");
  assert.equal(saved.status, "done");
  assert.equal(saved.usage.input_tokens, 10);            // usage parsed back to object
  assert.equal(saved.payload.zones[0].type, "driveway"); // payload parsed back to object

  const byHash = db.getSiteIntelRunByHash(A, F, H);
  assert.equal(byHash.id, "r1");

  const latest = db.getLatestSiteIntelRun(A, F);
  assert.equal(latest.id, "r1");

  // getByHash ignores non-done runs: an error run for a different hash shouldn't satisfy a done lookup.
  db.saveSiteIntelRun({ id: "r1b", accessId: A, floorId: F, sourceHash: "hash-err", status: "error", payload: { error: "x" } });
  assert.equal(db.getSiteIntelRunByHash(A, F, "hash-err"), null);

  // markOutdated flips the floor's DONE runs; a subsequent getByHash no longer reuses them.
  const n = db.markSiteIntelOutdated(A, F);
  assert.equal(n, 1);                                     // only the one done run (r1); r1b was 'error'
  assert.equal(db.getSiteIntelRunByHash(A, F, H), null);  // no longer reusable
  assert.equal(db.getSiteIntelRunById("r1").status, "outdated");
});

test("db: floor_id NULL is distinct and handled", () => {
  const A = "SITEINTEL2";
  db.saveSiteIntelRun({ id: "rn", accessId: A, floorId: null, sourceHash: "h0", status: "done", payload: validateSiteIntel({}) });
  assert.equal(db.getSiteIntelRunByHash(A, null, "h0").id, "rn");
  assert.equal(db.getLatestSiteIntelRun(A, null).id, "rn");
});

// ---- Route wiring (source-read; handlers need Next request/cookies to invoke) ----------------
test("route: auth guard, 503 gate, reuse branch and validator are wired", () => {
  const src = readFileSync(new URL("../app/api/site-intel/route.js", import.meta.url), "utf8");
  assert.match(src, /export const runtime = "nodejs"/);
  assert.match(src, /EDITORS\.includes\(tok\.role\)/);                 // writers only on POST
  assert.match(src, /viaPin && String\(tok\.accessId\) !== String\(accessId\)/); // PIN project match
  assert.match(src, /if \(!key\) return Response\.json\([\s\S]*?status: 503/); // 503 gate
  assert.match(src, /shouldReuseRun\(existing, analyzeAgain\)[\s\S]*?reused: true/); // cost reuse branch
  assert.match(src, /validateSiteIntel\(result\.raw/);                 // output validated
  assert.match(src, /status: "error"[\s\S]*?status: 502/);             // persist error + clean 502
  assert.match(src, /probe[\s\S]*?configured: configured\(\)/);        // probe returns configured
});
