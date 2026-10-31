// Maya Learn Mode — PURE helpers (no DB, no model). Parse the session toggle, recognize admin coaching
// feedback, and classify it into a category + severity + a short title + the expected behavior + a proposed
// fix. Deterministic so it's unit-testable, free, and predictable. The server (ai-actions) gates all of this
// on an authenticated ADMIN and only RECORDS — classification never changes behavior.

export const LEARN_CATEGORIES = ["Bug", "Wrong Answer", "Knowledge Gap", "Missing Capability", "Behavior Improvement", "Bad Judgment", "Workflow Problem", "Tool/Action Failure", "Permissions Problem", "UX Issue", "Other"];
export const LEARN_SEVERITIES = ["Low", "Medium", "High", "Critical"];
export const LEARN_STATUSES = ["reported", "reviewed", "approved", "implemented", "verified", "rejected", "duplicate", "deferred", "cannot_reproduce"];

// "enter/start/turn on Learn Mode" → "on"; "exit/stop/turn off Learn Mode" → "off"; else null.
export function parseLearnModeToggle(text) {
  const t = String(text || "").toLowerCase();
  if (!/\blearn(ing)?\s*mode\b/.test(t)) return null;
  if (/\b(exit|stop|turn\s*off|deactivate|disable|end|leave|out of)\b/.test(t) || /\blearn(ing)?\s*mode\s*off\b/.test(t)) return "off";
  if (/\b(enter|start|turn\s*on|activate|enable|begin|go into|into)\b/.test(t) || /\blearn(ing)?\s*mode\s*on\b/.test(t)) return "on";
  return null;
}

// Explicit one-off report ("report this as a bug", "log this as feedback") — works even without Learn Mode.
export function parseDirectReport(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(report|file|log|submit)\s+(this|that|it)?\s*(as\s+)?(a\s+)?(maya\s+)?(bug|feedback|issue|problem|learning|correction)\b/.test(t)
    || /\b(log|record|save)\s+(this|that|it)\s+(as\s+)?(feedback|a\s+bug|a\s+correction)\b/.test(t))
    return true;
  return false;
}

// An admin asking a Learn analytics question ("what have I taught you", "what recurs", "what's open").
export function parseLearnAnalyticsQuery(text) {
  const t = String(text || "").toLowerCase();
  return /\b(what (have|did) (i|we) (taught|teach|learn(ed)?|fix(ed)?|correct(ed)?))\b/.test(t)
    || /\b(what(?:'?s| is| are)?\s+(?:your|my)?\s*(?:most\s+)?(?:common|frequent|recurring)?\s*(mistakes|errors|corrections))\b/.test(t)
    || /\b(unresolved|outstanding|open)\s+(high|critical|learning|learn)\b/.test(t)
    || /\brecurring\s+(issues|problems|mistakes|failures)\b/.test(t)
    || /\blearn(ing)?\s+(queue|items|summary|analytics|report)\b/.test(t)
    || /\bwhat('?s| is| are)?\s+(still\s+)?(open|outstanding)\b[\s\S]{0,20}\blearn/.test(t)
    || /\b(what|which)\s+(maya\s+)?workflows?\s+.*(corrections|mistakes|errors)\b/.test(t);
}

// In Learn Mode, is this admin message coaching feedback (vs a normal command/question)? Inclusive but keyed
// on correction cues so it doesn't swallow an ordinary request.
const FEEDBACK_CUES = /\b(you\s+(got|were|should|shouldn'?t|couldn'?t|didn'?t|forgot|missed)|that\s+(answer|was|wasn'?t|isn'?t)|the\s+correct\s+(answer|thing)|wrong|incorrect|should\s+have|should\s+know|should\s+be\s+able|remember\s+this|not\s+good\s+enough|needs?\s+to\s+(improve|be\s+better)|works?\s+differently|bad\s+(answer|call|judg))\b/i;
export function detectLearnFeedback(text) {
  return parseDirectReport(text) || FEEDBACK_CUES.test(String(text || ""));
}

const CATEGORY_RULES = [
  ["Permissions Problem", /\b(permission|not allowed|unauthorized|should(n'?t)? be able to (see|access|do)|role (can'?t|should))\b/i],
  ["Tool/Action Failure", /\b(tool|action)\b[\s\S]{0,30}\b(fail|didn'?t|broke|should have used|not used)\b|\bshould'?ve?\s+used\s+the\s+[\w-]+\s+(tool|action)\b/i],
  ["Bug", /\b(bug|broke|broken|crash|error|glitch|didn'?t\s+work|doesn'?t\s+work|still sent|despite (the )?pause)\b/i],
  ["Missing Capability", /\b(couldn'?t|can'?t|unable to|no way to|should be able to)\b/i],
  ["Knowledge Gap", /\b(should know|didn'?t know|don'?t know|our (policy|rule|standard|pricing)|the rule is|always includes|standard .* (includes|is))\b/i],
  ["Bad Judgment", /\b(should have (checked|verified|looked|known)|bad (judg|call|reasoning)|didn'?t think|poor judgment)\b/i],
  ["Behavior Improvement", /\b(should(n'?t)?\b[\s\S]{0,40}\b(instead|first|before|ask|clarif)|prefer|better if|don'?t (immediately|just)|works? differently|ask one)\b/i],
  ["Wrong Answer", /\b(wrong|incorrect|not right|mistaken|that answer|told me .* but|said .* but|already (paid|did))\b/i],
  ["Workflow Problem", /\b(workflow|process|the flow|steps are)\b/i],
  ["UX Issue", /\b(confusing|hard to (find|use|read)|cluttered|ugly|layout|the ui|too many clicks)\b/i],
];
export function classifyLearnCategory(text) {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(String(text || ""))) return cat;
  return "Other";
}

export function classifyLearnSeverity(text, category) {
  const t = String(text || "").toLowerCase();
  if (/\b(security|privacy|leaked?|password|credential|delete[ds]?|destroy|wipe|charged?|money|financial|data loss|wrong customer|another customer)\b/.test(t)
    || /\bsent\b[\s\S]*\bdespite\b|\bdespite\b[\s\S]*\b(pause|paused)\b|charge a card/.test(t)) return "Critical";
  if (/\b(customer|incorrect (price|balance|total)|overdue|outstanding|invoice|payment|deposit|signed|sent to the customer|double|duplicate)\b/.test(t)) return "High";
  if (category === "UX Issue" || /\b(cosmetic|minor|typo|wording|spacing|color|slightly)\b/.test(t)) return "Low";
  return "Medium";
}

// Pull the "expected behavior" the admin stated, if any.
export function extractExpected(text) {
  const t = String(text || "").trim();
  const m = t.match(/\b(?:should(?:'?ve| have)?|the correct (?:answer|thing) (?:is|was)|expected(?: you)? to|you should|instead(?: you should)?|needs? to)\s+(.{3,180})/i);
  if (!m) return "";
  return m[1].replace(/[.?!]+$/, "").trim().slice(0, 180);
}

const FIX_BY_CATEGORY = {
  "Bug": "Investigate the failure, fix it, and add a regression test capturing this scenario.",
  "Wrong Answer": "Verify the relevant data (e.g. current payment/stage state) before answering.",
  "Knowledge Gap": "Add the stated rule to the approved knowledge base for review before it affects answers.",
  "Missing Capability": "Scope the capability and wire it through the existing guarded action pattern.",
  "Behavior Improvement": "Adjust the behavior as described, after review.",
  "Bad Judgment": "Add the missing check/step to the decision before acting.",
  "Workflow Problem": "Revisit the workflow sequence for this scenario.",
  "Tool/Action Failure": "Ensure the correct tool/action is selected and succeeds for this case.",
  "Permissions Problem": "Review the permission rule — server-side — before any change.",
  "UX Issue": "Refine the UI for clarity.",
  "Other": "Review and decide on an appropriate improvement.",
};

// Build a learn item from a free-text admin correction. Title is a short readable summary.
export function buildLearnItem(text) {
  const raw = String(text || "").trim();
  const category = classifyLearnCategory(raw);
  const severity = classifyLearnSeverity(raw, category);
  const expected = extractExpected(raw);
  const title = raw.replace(/^\s*(you|that|this|maya[,:]?)\s+/i, "").replace(/\s+/g, " ").trim().slice(0, 70) || "Maya feedback";
  const proposedFix = expected ? `Expected: ${expected}. ${FIX_BY_CATEGORY[category]}` : FIX_BY_CATEGORY[category];
  return { category, severity, title: title[0]?.toUpperCase() + title.slice(1), whatHappened: raw.slice(0, 1000), expected, proposedFix };
}

// Token-set Jaccard similarity for dedup (0..1). Pure.
const toks = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
export function similarity(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
