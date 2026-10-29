// Bug QUEUE (Phase 1) — the /bugs portal as a sequential Claude Code task queue. Exercises enqueue
// ordering + idempotency, the atomic one-at-a-time claim, heartbeat, result (review/failed), the
// failure→stop_after_current safety, retry, dequeue and the compact state. Throwaway SQLite file.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "bugq-"));
process.env.TZ = "America/New_York";

let db;
const mk = (description, severity = "medium") => db.createBugReport({ description, path: "/x", severity }).id;

before(async () => { db = await import("../lib/db.js"); });

test("enqueue allOpen orders by severity then recency; only open+unqueued; idempotent", () => {
  const low = mk("low one", "low");
  const crit = mk("crit one", "critical");
  const med = mk("med one", "medium");
  const r = db.enqueueBugs({ allOpen: true });
  // critical first, then medium, then low (severity desc); same-severity would be id desc.
  assert.deepEqual(r.queued, [crit, med, low], "severity-ordered default");
  // Re-running enqueues nothing (already queued).
  assert.deepEqual(db.enqueueBugs({ allOpen: true }).queued, [], "idempotent");
  // A resolved bug is never queued.
  const done = mk("resolved one", "high"); db.resolveBugReport(done, true, "tester");
  assert.deepEqual(db.enqueueBugs({ ids: [done] }).queued, [], "resolved not queueable");
});

test("claim is one-at-a-time and atomic; sets running + a run row + attempt", () => {
  const first = db.claimNextBug();
  assert.ok(first, "claimed one");
  assert.equal(first.queue_status, "running");
  assert.equal(first.attempt_count, 1);
  assert.equal(db.claimNextBug(), null, "second claim blocked while one runs");
  const runs = db.getBugRuns(first.id);
  assert.equal(runs[0].state, "running");
  assert.ok(db.heartbeatBug(first.id).ok, "heartbeat updates the running bug");
  return (globalThis.__first = first);
});

test("result review → Ready for Review; queue keeps running; next claimable", () => {
  const first = globalThis.__first;
  const res = db.finishBugRun(first.id, { outcome: "review", summary: "fixed X", filesChanged: ["a.js"], branch: "claude/bug-" + first.id, commitSha: "abc123", validation: { test: "pass", build: "pass" } });
  assert.equal(res.outcome, "review");
  const runs = db.getBugRuns(first.id);
  assert.equal(runs[0].state, "review");
  assert.equal(JSON.parse(runs[0].files_changed)[0], "a.js");
  assert.equal(db.getBugQueueMode(), "running", "review does not pause the queue");
  const second = db.claimNextBug();
  assert.ok(second, "next bug claimable after a review");
  globalThis.__second = second;
});

test("result failed → Failed + queue auto-stops (stop_after_current); no further claim", () => {
  const second = globalThis.__second;
  db.finishBugRun(second.id, { outcome: "failed", error: "tests red", validation: { test: "fail" } });
  assert.equal(db.getBugQueueMode(), "stop_after_current", "failure stops the queue");
  const runs = db.getBugRuns(second.id);
  assert.equal(runs[0].state, "failed");
  assert.equal(db.claimNextBug(), null, "nothing claimed while stopped");
  // Resume → claiming works again.
  db.setBugQueueMode("running");
  assert.equal(db.getBugQueueMode(), "running");
});

test("retry re-queues a failed bug; dequeue removes a queued one", () => {
  const second = globalThis.__second;            // currently failed
  assert.ok(db.retryBug(second.id).ok, "failed bug can be retried");
  // A running bug cannot be retried/dequeued.
  const running = db.claimNextBug();
  assert.ok(running);
  assert.equal(db.dequeueBug(running.id).ok, false, "running bug can't be dequeued");
  db.finishBugRun(running.id, { outcome: "review" });
});

test("getBugQueueState shape: mode, running, next, counts, stuck", () => {
  const st = db.getBugQueueState();
  assert.ok(["running", "stop_after_current"].includes(st.mode));
  assert.ok("running" in st && Array.isArray(st.next) && typeof st.counts === "object" && typeof st.stuck === "boolean");
});
