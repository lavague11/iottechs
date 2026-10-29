// Bug queue (Phase 3) — run history + review data. Attempts are preserved across retries (newest first),
// 'review' never resolves the bug, failures keep their reason, run fields round-trip, and the repo URL is
// stored safely (no auth-embedded remotes). Throwaway SQLite file. Access control is enforced in the route
// modules (asserted by source below) since cookies aren't available to node:test.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "bugruns-"));
process.env.TZ = "America/New_York";

let db;
const mk = (d) => db.createBugReport({ description: d, path: "/x", severity: "medium" }).id;
const bugRow = (id) => db.listBugReports().find((x) => x.id === id);

before(async () => { db = await import("../lib/db.js"); });

test("attempts are preserved across retry, newest first; review ≠ resolved; failure keeps its reason", () => {
  const id = mk("history bug");
  db.enqueueBugs({ ids: [id] });

  // Attempt 1 → failed.
  const a1 = db.claimNextBug();
  assert.equal(a1.id, id); assert.equal(a1.attempt_count, 1);
  db.finishBugRun(id, { outcome: "failed", error: "boom in module X", validation: { test: "fail" } });
  assert.equal(db.getBugQueueMode(), "stop_after_current", "failure stops the queue");

  // Retry preserves history and does NOT execute immediately — just re-queues.
  db.setBugQueueMode("running");
  db.retryBug(id);
  assert.equal(bugRow(id).queue_status, "queued", "retry re-queues");
  assert.equal(db.getBugRuns(id).length, 1, "retry kept the prior attempt");

  // Attempt 2 → review, with full fields + a repo URL.
  const a2 = db.claimNextBug();
  assert.equal(a2.attempt_count, 2);
  db.finishBugRun(id, {
    outcome: "review", summary: "Root cause: stale cache. Fixed by invalidating on save.",
    filesChanged: ["dashboard/lib/db.js", "dashboard/app/bugs/bugs-client.jsx"],
    branch: `claude/bug-${id}`, commitSha: "abcdef1234567890", validation: { targeted: "pass", test: "pass", build: "pass" },
    repoUrl: "https://github.com/owner/repo.git",
  });

  const runs = db.getBugRuns(id);
  assert.equal(runs.length, 2, "both attempts preserved");
  assert.equal(runs[0].attempt, 2); assert.equal(runs[0].state, "review");   // newest first
  assert.equal(runs[1].attempt, 1); assert.equal(runs[1].state, "failed");
  assert.equal(runs[1].error, "boom in module X", "failed attempt kept its reason");

  // review ≠ resolved — human status untouched.
  const b = bugRow(id);
  assert.equal(b.queue_status, "review");
  assert.equal(b.status, "open", "review must NOT set status=resolved");

  // Run fields round-trip (what the Review UI renders).
  assert.equal(runs[0].summary, "Root cause: stale cache. Fixed by invalidating on save.");
  assert.deepEqual(JSON.parse(runs[0].files_changed), ["dashboard/lib/db.js", "dashboard/app/bugs/bugs-client.jsx"]);
  assert.equal(runs[0].branch, `claude/bug-${id}`);
  assert.equal(runs[0].commit_sha, "abcdef1234567890");
  assert.deepEqual(JSON.parse(runs[0].validation), { targeted: "pass", test: "pass", build: "pass" });

  // The newest run is what the route exposes as last_run.
  assert.equal(db.getBugRuns(id, 1)[0].id, runs[0].id, "last_run = newest run");
});

test("repoUrl is stored safely from the runner; auth-embedded remotes are rejected", () => {
  assert.equal(db.secretValue("GITHUB_REPO_URL"), "https://github.com/owner/repo", ".git stripped, stored");
  // A remote with embedded credentials must never be stored.
  const id = mk("repo url guard");
  db.enqueueBugs({ ids: [id] }); db.claimNextBug();
  db.finishBugRun(id, { outcome: "review", repoUrl: "https://user:token@github.com/owner/repo.git" });
  assert.equal(db.secretValue("GITHUB_REPO_URL"), "https://github.com/owner/repo", "auth-embedded URL rejected; prior value kept");
});

test("staff-only gating is enforced in the queue + bug-report routes (source check)", () => {
  const q = readFileSync(new URL("../app/api/queue/route.js", import.meta.url), "utf8");
  assert.ok(/\["admin",\s*"manager"\]/.test(q) && /Staff only/.test(q), "queue route gates admin/manager");
  const br = readFileSync(new URL("../app/api/bug-report/route.js", import.meta.url), "utf8");
  assert.ok(/\["admin",\s*"manager"\]/.test(br), "bug-report route gates admin/manager for staff data");
  // Runner endpoints require the Bearer token.
  const claim = readFileSync(new URL("../app/api/queue/claim/route.js", import.meta.url), "utf8");
  assert.ok(/runnerAuthorized/.test(claim), "claim requires runner auth");
});
