import { secretValue, listUntaggedSopSteps, countUntaggedSopSteps, setSopStepTags } from "./db.js";
import { SOP_CLAUDE_MODEL_DEFAULT } from "./sop-model.js";
import { runAutoTag, tagFail } from "./sop-tag-core.js";

// Auto-tag existing SOP steps (text only). Thin DB/secret wrapper around the pure core; writes ONLY
// sop_steps.tags. Returns { tagged, remaining, written } where written = { [stepId]: storedTags[] } so the
// client can merge it into an open guide. Errors carry `.status`.
let running = false; // best-effort in-flight lock (single process)

export async function autoTagSopSteps({ limit = 40 } = {}) {
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) throw tagFail(503, "AI isn’t configured — add ANTHROPIC_API_KEY in Development ▸ API Keys.");
  if (running) throw tagFail(409, "Already tagging — try again in a moment.");
  running = true;
  try {
    const rows = listUntaggedSopSteps(Math.min(60, Math.max(1, Number(limit) || 40))); // sopTagUserMessage sends at most 60
    if (!rows.length) return { tagged: 0, remaining: 0, written: {} };
    const model = secretValue("SOP_CLAUDE_MODEL") || SOP_CLAUDE_MODEL_DEFAULT;
    const { tagged, written } = await runAutoTag({ rows, key, model, write: setSopStepTags });
    return { tagged, remaining: countUntaggedSopSteps(), written };
  } finally {
    running = false;
  }
}
