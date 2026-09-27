// Service-call status — ONE canonical model for every service (CCTV, network, ADT, audio…).
// Imported by db.js (transitions), the list/detail/tracker pages (pills, roll-ups) and svc-model.

// ---- Canonical service-call status (one model for every service) ------------------------------
export const SVC_STATUSES = [
  { key: "draft",          label: "Draft" },
  { key: "scheduled",      label: "Scheduled" },
  { key: "on_site",        label: "On Site" },
  { key: "diagnosing",     label: "Diagnosing" },
  { key: "findings_ready", label: "Findings Ready" },
  { key: "estimate_ready", label: "Estimate Ready" },
  { key: "sent",           label: "Sent" },
  { key: "approved",       label: "Approved" },
  { key: "waiting_parts",  label: "Waiting Parts" },
  { key: "follow_up",      label: "Follow-Up" },
  { key: "completed",      label: "Completed" },
  { key: "warranty",       label: "Warranty" },
  { key: "canceled",       label: "Canceled" },
];
// Keys the first TRACE release stored → canonical keys (one-time data normalization in db.js).
export const SVC_STATUS_ALIAS = { submitted: "draft", onsite: "on_site", quoted: "estimate_ready", resolved: "completed", billed: "approved", closed: "completed" };
export const SVC_CLOSED = new Set(["completed", "warranty", "canceled"]);
export const svcStatusIndex = (key) => SVC_STATUSES.findIndex((s) => s.key === (SVC_STATUS_ALIAS[key] || key));
export const svcStatusLabel = (key) => SVC_STATUSES[svcStatusIndex(key)]?.label || key || "";
export const svcIsOpen = (key) => !SVC_CLOSED.has(SVC_STATUS_ALIAS[key] || key);
// Three-step roll-up every audience shares (list pills stay per status).
export const SVC_STEPS = [
  { key: "received", label: "Received",  set: "draft",      statuses: ["draft", "scheduled", "on_site"] },
  { key: "diagnosed", label: "Diagnosed", set: "diagnosing", statuses: ["diagnosing", "findings_ready", "estimate_ready", "sent", "approved", "waiting_parts", "follow_up"] },
  { key: "solved",   label: "Solved",    set: "completed",  statuses: ["completed", "warranty", "canceled"] },
];
export const svcStepIndex = (key) => Math.max(0, SVC_STEPS.findIndex((st) => st.statuses.includes(SVC_STATUS_ALIAS[key] || key)));
// Forward-only automatic move: returns the new key when `target` is later than `current`, else null.
export function svcAutoAdvance(current, target) {
  const ci = svcStatusIndex(current), ti = svcStatusIndex(target);
  if (ti < 0 || SVC_CLOSED.has(SVC_STATUS_ALIAS[current] || current)) return null;
  return ti > ci ? SVC_STATUSES[ti].key : null;
}

