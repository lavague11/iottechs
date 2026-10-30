// Maya proactive composers — pure summary builders for the morning briefing + weekly report. The
// orchestrator (runMayaProactive) is DARK unless MAYA_PROACTIVE=on and is deduped once/day + once/Monday;
// here we prove the composed copy is correct (and singular/plural + $ are grounded in the real counts).
import test from "node:test";
import assert from "node:assert/strict";
import { briefingLines, weeklyLines, runMayaNudges } from "../lib/maya-proactive.js";

test("briefing: nothing outstanding reads calmly", () => {
  const L = briefingLines({ awaitingSig: 0, sigOverdue: 0, dueNow: 0, dueAmt: 0 });
  assert.match(L[0], /No proposals waiting/);
  assert.match(L[1], /No payments currently due/);
});

test("briefing: counts + overdue + outstanding $ are reported, grounded", () => {
  const L = briefingLines({ awaitingSig: 3, sigOverdue: 1, dueNow: 2, dueAmt: 4200 });
  assert.match(L[0], /3 proposals awaiting signature — 1 past the deadline/);
  assert.match(L[1], /2 payments due now — \$4,200\.00 outstanding/);
  // singular grammar
  const S = briefingLines({ awaitingSig: 1, sigOverdue: 0, dueNow: 1, dueAmt: 500 });
  assert.match(S[0], /1 proposal awaiting signature\./);
  assert.match(S[1], /1 payment due now/);
});

test("weekly: sent / signed / collected / open, from the counts", () => {
  const L = weeklyLines({ sent7: 9, signed7: 4, collected7: 18250.5, awaitingSig: 6, dueNow: 2 });
  assert.deepEqual(L, [
    "Quotes sent (7 days): 9",
    "Proposals signed (7 days): 4",
    "Collected (7 days): $18,250.50",
    "Open now: 6 awaiting signature, 2 payments due.",
  ]);
});

test("runMayaNudges is wired (customer nudge sweep)", () => {
  assert.equal(typeof runMayaNudges, "function");
});
