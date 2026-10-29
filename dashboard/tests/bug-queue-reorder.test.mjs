// Bug queue (Phase 2) — drag-and-drop reordering. Reordering changes the claim order of QUEUED bugs and
// never disturbs the one that's already RUNNING. Throwaway SQLite file.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "bugqr-"));
process.env.TZ = "America/New_York";

let db;
const mk = (d) => db.createBugReport({ description: d, path: "/x", severity: "medium" }).id;
const nextIds = () => db.getBugQueueState().next.map((x) => x.id);

before(async () => { db = await import("../lib/db.js"); });

test("reorder changes the queued order and the next claim follows it", () => {
  const a = mk("A"), b = mk("B"), c = mk("C");
  db.enqueueBugs({ ids: [a, b, c] });
  assert.deepEqual(nextIds(), [a, b, c], "initial order");
  db.reorderQueue([c, a, b]);
  assert.deepEqual(nextIds(), [c, a, b], "reordered to c,a,b");
  assert.equal(db.claimNextBug().id, c, "claim takes the reordered front");
});

test("reordering the rest never disturbs the running bug", () => {
  const st0 = db.getBugQueueState();
  assert.ok(st0.running && st0.running.id, "one bug is running");
  const runId = st0.running.id;
  const rest = nextIds();                       // the still-queued ids
  db.reorderQueue([...rest].reverse());         // flip their order
  const st1 = db.getBugQueueState();
  assert.equal(st1.running.id, runId, "running bug unchanged");
  assert.deepEqual(nextIds(), [...rest].reverse(), "queued order flipped");
  assert.ok(!nextIds().includes(runId), "running bug is not in the queued list");
});

test("reorder ignores ids that aren't queued and keeps omitted ones at the tail", () => {
  // finish the running one so we have a clean queued set
  const run = db.getBugQueueState().running;
  if (run) db.finishBugRun(run.id, { outcome: "review" });
  const q = nextIds();                          // currently queued
  const bogus = 999999;
  db.reorderQueue([q[q.length - 1], bogus]);     // move the last to front; bogus is ignored; others kept at tail
  const after = nextIds();
  assert.equal(after[0], q[q.length - 1], "named id moved to front");
  assert.equal(after.length, q.length, "no ids lost, none added");
});
