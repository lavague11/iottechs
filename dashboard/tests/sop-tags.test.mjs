// SOP step auto-tagging (server side) — source assertions + an executed SQL check on an in-memory DB.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SOP_STEP_REAL_SQL, SOP_STEP_UNTAGGED_SQL } from "../lib/sop-model.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const tagger = read("../lib/sop-tagger.js");
const core = read("../lib/sop-tag-core.js");
const route = read("../app/api/sop/tags/route.js");
const actions = read("../app/tools/sop-builder/actions.js");

function fnBody(src, name) {
  const i = src.indexOf(`export function ${name}`);
  assert.ok(i >= 0, `${name} exported`);
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

test("route is staff-gated before any tagging and returns written", () => {
  assert.ok(route.includes('export const runtime = "nodejs"'));
  assert.ok(route.includes("export async function POST"));
  assert.ok(route.indexOf("canEditSop(") >= 0 && route.indexOf("canEditSop(") < route.indexOf("autoTagSopSteps()"));
  assert.ok(route.includes("status: 403"));
  assert.ok(!/ANTHROPIC_API_KEY|secretValue/.test(route), "route never touches the key");
  assert.ok(/tagged, remaining, written/.test(route));
});

test("db helpers are exported and use the shared SQL fragments", () => {
  for (const n of ["listUntaggedSopSteps", "countUntaggedSopSteps", "setSopStepTags"]) assert.ok(db.includes(`export function ${n}`), n);
  assert.ok(fnBody(db, "listUntaggedSopSteps").includes("SOP_STEP_UNTAGGED_SQL"));
  assert.ok(fnBody(db, "countUntaggedSopSteps").includes("SOP_STEP_UNTAGGED_SQL"));
  assert.ok(fnBody(db, "searchSopSteps").includes("SOP_STEP_REAL_SQL"));
  assert.ok(db.includes('from "./sop-model.js"'));
});

test("setSopStepTags writes only sop_steps.tags and returns stored array or null", () => {
  const body = fnBody(db, "setSopStepTags");
  assert.ok(!body.includes("sop_versions"));
  assert.ok(body.includes("normTags") && body.includes("UPDATE sop_steps SET tags=? WHERE id=?"));
  assert.ok(/if \(!t\) return null/.test(body) && body.includes('t.split(",")'));
});

test("tagger: thin wrapper, never touches sop_versions, early return before any run, lock + clamp", () => {
  assert.ok(!tagger.includes("sop_versions") && !core.includes("sop_versions"));
  assert.ok(!/from "\.\/db/.test(core), "core has no db import");
  const early = tagger.indexOf("return { tagged: 0, remaining: 0, written: {} }");
  assert.ok(early > 0 && early < tagger.indexOf("runAutoTag("), "early return precedes the core call");
  assert.ok(tagger.includes("tagFail(409") && tagger.includes("running = false"));
  assert.ok(tagger.includes("listUntaggedSopSteps(Math.min(60, Math.max(1, Number(limit) || 40)))"));
  assert.ok(tagger.includes("write: setSopStepTags") && tagger.includes("countUntaggedSopSteps()"));
});

test("searchStepsAction returns untagged count", () => {
  assert.ok(/untagged:\s*countUntaggedSopSteps\(\)/.test(actions));
});

test("SQL predicates executed on an in-memory DB", () => {
  const m = new DatabaseSync(":memory:");
  m.exec(`CREATE TABLE sops (id TEXT PRIMARY KEY, title TEXT, status TEXT, updated_at TEXT);
          CREATE TABLE sop_steps (id INTEGER PRIMARY KEY, sop_id TEXT, position INTEGER, title TEXT, instruction TEXT, tags TEXT);
          INSERT INTO sops VALUES ('g1','Live','draft','2'),('g2','Old','archived','1');`);
  const ins = m.prepare("INSERT INTO sop_steps (id, sop_id, position, title, instruction, tags) VALUES (?,?,?,?,?,?)");
  ins.run(1, "g1", 1, "Reset camera", "hold button", null);   // the one untagged
  ins.run(2, "g1", 2, "Check NVR", "look", "nvr,check");        // tagged
  ins.run(3, "g1", 3, "↳ Imported", "", null);                  // divider
  ins.run(4, "g1", 4, " ↳ Imported 2", "", null);               // divider w/ leading space
  ins.run(5, "g1", 5, "   ", "x", null);                        // blank title
  ins.run(6, "g2", 1, "Archived step", "x", "");                // archived guide
  const q = (where) => m.prepare(`SELECT st.id FROM sop_steps st JOIN sops s ON s.id = st.sop_id WHERE ${where} ORDER BY st.id`).all().map((r) => r.id);
  assert.deepEqual(q(SOP_STEP_UNTAGGED_SQL), [1]);
  assert.equal(m.prepare(`SELECT COUNT(*) n FROM sop_steps st JOIN sops s ON s.id = st.sop_id WHERE ${SOP_STEP_UNTAGGED_SQL}`).get().n, 1);
  assert.deepEqual(q(SOP_STEP_REAL_SQL), [1, 2]);
});
