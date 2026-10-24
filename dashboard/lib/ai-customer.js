// Phase 6 (#3) — customer-facing AI. The HARD ALLOWLIST and the read resolver for a CUSTOMER assistant.
//
// Safety spine: a customer NEVER reaches the staff assistant (aiGate is staff-only and stays that way). A
// separate customer entry (aiCustomerInterpretAction) runs ONLY the read queries named here, ON THE CUSTOMER'S
// OWN PROJECT, with role="customer" so the answer layer's existing capability + sanitize stripping removes
// cost / payout / internal notes / other projects. The allowlist is enforced on the RESOLVED intent, so even a
// query produced some other way can't escape it. Customer text is UNTRUSTED: this slice uses the deterministic
// 0-token router only (no model fallback on customer input) + approved-knowledge FAQ, and performs NO writes.
import { routeCommand } from "./ai-command.js";

// The only reads a customer may run — each is already customer-safe in ai-answer (money is capability-gated to
// customer.financials.view, which a customer has only for THEIR OWN figures; everything else role-strips).
// Deliberately EXCLUDED: project_payout (tech pay), project_issues (internal flags), project_next (internal
// ops/owners), feedback_summary (internal), projects_by_stage / awaiting_signature (cross-project staff views).
export const CUSTOMER_READS = Object.freeze(new Set([
  "project_status",     // their stage + what's awaiting them (money role-stripped)
  "proposal_total",     // their quote total
  "project_money",      // their balance / amount due
  "device_coverage",    // what a camera on their system covers (survey facts, non-financial)
  "project_timeline",   // how long at the current stage
]));

export function customerReadAllowed(query) { return CUSTOMER_READS.has(String(query || "")); }

// Resolve a customer utterance to an ALLOWLISTED read intent, or null. Router only (customer text is untrusted
// — no model fallback here). The caller FORCES the target to the customer's own project, so a named other
// project can never be queried. Returns { query, ref? } | null.
export function customerReadIntent(text) {
  const r = routeCommand(text);
  if (r && r.type === "answer" && CUSTOMER_READS.has(r.query)) {
    return { query: r.query, ...(r.ref ? { ref: String(r.ref).slice(0, 160) } : {}) };
  }
  return null;   // anything not on the allowlist (incl. every write/action/navigation) → caller falls to knowledge/fallback
}
