// gate-rollout-check.mjs — READ-ONLY rollout audit for the phase gate (lib/spec.js phaseGate).
// Answers: which existing projects sit PAST an unmet enforceable requirement — i.e. their current
// stage is further than the check-backed done-conditions alone would allow. Under "lock advancement,
// don't retro-lock" these are NOT re-locked below where they are, but their NEXT phase would show
// locked and they can't auto-advance until the missing sign-off is recorded. Run from dashboard/:
//   node scripts/gate-rollout-check.mjs
import { getAllJobs, buildStageFacts } from "../lib/db.js";
import { STAGES, stageLabel } from "../lib/spec.js";
import { gateThroughIndex, blockingReqs } from "../lib/stage-flow.js";

const ORDER = STAGES.map((s) => s.key);
const idxOf = (k) => ORDER.indexOf(k);

const jobs = getAllJobs();
const rows = [];
for (const j of jobs) {
  let facts; try { facts = buildStageFacts(j.access_id); } catch { facts = j; }
  const curIdx = Math.max(0, idxOf(j.stage));
  const scratchIdx = gateThroughIndex(facts, [], ORDER, 0);      // furthest passable ignoring current stage
  if (curIdx > scratchIdx) {                                      // project advanced past an unmet gate
    const missing = blockingReqs(ORDER[scratchIdx], facts, []).map((r) => r.label).join("; ");
    rows.push({ id: j.access_id, customer: j.customer, at: stageLabel(j.stage),
                gatedAt: stageLabel(ORDER[scratchIdx]), missing });
  }
}

console.log(`\nProjects scanned: ${jobs.length}`);
console.log(`Sitting past an unmet enforceable gate: ${rows.length}\n`);
if (rows.length) {
  for (const r of rows) console.log(`  ${r.id}  "${r.customer}"\n     at: ${r.at}  |  first unmet gate: ${r.gatedAt}  |  missing: ${r.missing}`);
} else {
  console.log("  None — every project's current stage is backed by its recorded sign-offs.");
}
console.log("");
