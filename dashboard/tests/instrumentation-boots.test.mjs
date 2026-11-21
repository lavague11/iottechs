// The boot scheduler must actually BOOT. A missing reference inside register() is a RUNTIME error, not a
// syntax error: `npm run build` passes, the server then fails to start, and every route 500s. That is
// exactly what shipped in this run and took production down until it was caught by hand — the test
// suite never boots a server, so nothing else in it could have seen this.
//
// Importing and calling register() for real would install its intervals and hang the test runner, so
// this checks the one thing that actually broke: a sweep scheduled but never defined.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../instrumentation.js", import.meta.url), "utf8");

test("every function handed to setTimeout/setInterval is defined in the same scope", () => {
  const scheduled = [...new Set([...src.matchAll(/set(?:Timeout|Interval)\((\w+),/g)].map((m) => m[1]))];
  const defined = [...src.matchAll(/const (\w+) = async \(\) =>/g)].map((m) => m[1]);
  assert.ok(scheduled.length > 0, "there are sweeps to schedule");
  const missing = scheduled.filter((s) => !defined.includes(s));
  assert.deepEqual(missing, [], `scheduled but never defined: ${missing.join(", ")}`);
});

test("removing a sweep removes BOTH its definition and its schedule", () => {
  // The inverse of the bug: a sweep left defined but unscheduled is dead code that reads as live.
  const scheduled = new Set([...src.matchAll(/set(?:Timeout|Interval)\((\w+),/g)].map((m) => m[1]));
  const defined = [...src.matchAll(/const (\w+) = async \(\) =>/g)].map((m) => m[1]);
  const orphans = defined.filter((d) => !scheduled.has(d));
  assert.deepEqual(orphans, [], `defined but never scheduled: ${orphans.join(", ")}`);
});
