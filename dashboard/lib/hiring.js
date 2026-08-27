// Technician hiring — the status engine. Pure, importable from anywhere (no DB/edge concerns).
// One candidate record threads three portals; `status` is the fine-grained source of truth and
// `portal` is derived from it. Legacy `stage` (applied|reviewing|interview|offer|hired|declined)
// is kept coarsely in sync so the older tracker/review screens keep working during the migration.

export const PORTALS = [
  { n: 1, key: "recruitment", label: "Recruitment", ask: "Should we hire you?" },
  { n: 2, key: "compliance",  label: "Compliance",  ask: "Are you cleared to work?" },
  { n: 3, key: "training",    label: "Training",    ask: "Trained to represent us?" },
];

// Ordered status ladder. tone: neutral | active | good | bad. `bridge` = leaving this portal.
export const HIRING_STATUSES = [
  // Portal 1 — Recruitment
  { key: "applied",           portal: 1, label: "Applied",            tone: "neutral" },
  { key: "assessment",        portal: 1, label: "Assessment",         tone: "active" },
  { key: "phone",             portal: 1, label: "Phone Interview",    tone: "active" },
  { key: "in_person",         portal: 1, label: "In-Person + Skills", tone: "active" },
  { key: "sop",               portal: 1, label: "Dispatch / SOP",     tone: "active" },
  { key: "ride_along",        portal: 1, label: "Ride-Along",         tone: "active" },
  { key: "final_review",      portal: 1, label: "Final Review",       tone: "active" },
  { key: "declined",          portal: 1, label: "Not Selected",       tone: "bad", terminal: true },
  // Portal 2 — Compliance
  { key: "documents_pending", portal: 2, label: "Documents Pending",  tone: "neutral" },
  { key: "background_pending",portal: 2, label: "Background Pending",  tone: "active" },
  { key: "compliance_review", portal: 2, label: "Compliance Review",  tone: "active" },
  { key: "cleared",           portal: 2, label: "Cleared for Training",tone: "good", bridge: true },
  // Portal 3 — Training & Certification
  { key: "new_hire",          portal: 3, label: "New Hire",           tone: "neutral" },
  { key: "onboarding",        portal: 3, label: "Onboarding",         tone: "active" },
  { key: "training",          portal: 3, label: "Training",           tone: "active" },
  { key: "supervised",        portal: 3, label: "Supervised Tech",    tone: "active" },
  { key: "final_cert",        portal: 3, label: "Final Certification",tone: "active" },
  { key: "approved",          portal: 3, label: "Approved Technician",tone: "good", terminal: true },
];

const BY_KEY = Object.fromEntries(HIRING_STATUSES.map((s) => [s.key, s]));

export function statusMeta(key) { return BY_KEY[key] || null; }
export function statusLabel(key) { return BY_KEY[key]?.label || key || "—"; }
export function portalOfStatus(key) { return BY_KEY[key]?.portal || 1; }
export function portalMeta(n) { return PORTALS.find((p) => p.n === n) || PORTALS[0]; }
export function statusesForPortal(n) { return HIRING_STATUSES.filter((s) => s.portal === n); }

// The single hire / advance transitions between portals.
export const HIRE_STATUS = "documents_pending";   // final_review → hire → Portal 2
export const START_TRAINING_STATUS = "new_hire";  // cleared → start training → Portal 3

// Map a legacy `stage` onto a modern status (for backfilling existing rows).
export function statusFromLegacyStage(stage) {
  switch (stage) {
    case "applied":   return "applied";
    case "reviewing": return "assessment";
    case "interview": return "phone";
    case "offer":     return "documents_pending";
    case "hired":     return "documents_pending";
    case "declined":  return "declined";
    default:          return "applied";
  }
}

// Map a modern status back to a coarse legacy `stage`, so older screens still read correctly.
export function legacyStageFromStatus(key) {
  const p = portalOfStatus(key);
  if (key === "declined") return "declined";
  if (key === "applied")  return "applied";
  if (p === 1)            return key === "phone" || key === "in_person" || key === "ride_along" || key === "final_review" ? "interview" : "reviewing";
  return "hired";   // any Portal 2/3 status = hired, in legacy terms
}

// Portal 1 evaluation steps — each is a scorecard the office fills in. The 25-Q assessment is its
// own thing (auto + AI graded); these four are human-scored on a shared 1–5 rubric.
export const STEP_RUBRICS = {
  phone:      { label: "Phone Interview",      criteria: [["communication", "Communication & professionalism"], ["reliability", "Reliability & availability"], ["experience", "Relevant experience"], ["motivation", "Motivation & fit"]] },
  in_person:  { label: "In-Person + Skills",   criteria: [["tools", "Tool & material knowledge"], ["handson", "Hands-on skill demonstrated"], ["problem", "Problem-solving"], ["professional", "Professionalism & appearance"]] },
  sop:        { label: "Dispatch / SOP",       criteria: [["scope", "Scope & authorization"], ["docs", "Documentation discipline"], ["escalation", "Escalation judgment"], ["customer", "Customer handling"]] },
  ride_along: { label: "Ride-Along / Field",   criteria: [["performance", "Real job performance"], ["process", "Follows process on site"], ["field_comm", "Communication in the field"], ["attitude", "Attitude & coachability"]] },
};
export const P1_EVAL_STEPS = ["phone", "in_person", "sop", "ride_along"];

// The full Portal 1 status flow, in order, for "advance to next step".
export const P1_FLOW = ["applied", "assessment", "phone", "in_person", "sop", "ride_along", "final_review"];
export function nextP1Status(cur) { const i = P1_FLOW.indexOf(cur); return i >= 0 && i < P1_FLOW.length - 1 ? P1_FLOW[i + 1] : cur; }

// Resolve a row's portal+status, deriving from legacy stage when the columns aren't set yet.
export function resolveHiring(row) {
  const status = row?.status || statusFromLegacyStage(row?.stage);
  return { status, portal: portalOfStatus(status), meta: statusMeta(status) };
}
