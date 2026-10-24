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

// Slice 3 — a customer WRITE/ACTION intent. Two shapes only:
//   { kind:"comment", body } — the ONE true customer write: relay a message to the project team (addNoteAction,
//                              confirmed). Fires only on an explicit comment/relay phrasing, never a question.
//   { kind:"nav", label }    — a DELIBERATE act (sign / accept / pay). The AI never performs it; the caller
//                              routes the customer to the real flow (their proposal section). Guided nav only.
// Returns null otherwise. Pure.
export function customerActionIntent(text) {
  const raw = String(text || "").trim();
  const t = raw.toLowerCase();
  if (!t) return null;
  // Deliberate acts → guided navigation (the AI routes, it does not sign/accept/pay).
  if (/\b(sign|e-?sign|accept|approve)\b[\s\S]*\b(proposal|quote|contract|agreement|option|it|this)\b/.test(t)
    || /\b(ready to (sign|accept|approve)|let'?s sign|go ahead and sign|i'?m in|i'?ll take it)\b/.test(t))
    return { kind: "nav", label: "review & sign your proposal" };
  if (/\b(how (do i|to)|where (do i|can i))\b[\s\S]*\b(pay|payment|deposit|balance|invoice)\b/.test(t)
    || /\b(make|submit|send)\b[\s\S]*\b(payment|deposit)\b/.test(t) || /\bpay (my|the|this) (deposit|balance|invoice|proposal|quote)\b/.test(t))
    return { kind: "nav", label: "your proposal and payment details" };
  // A message to relay to the team → the one true write. Requires an explicit relay lead-in + something to say.
  const m = raw.match(/^\s*(?:(?:please\s+)?(?:leave|add|post)\s+(?:a\s+)?(?:comment|note|message)|comment|note|message|tell\s+(?:them|the team|my installer|you|us)|let\s+(?:them|the team|my installer|us)\s+know|ask\s+(?:them|the team|my installer|you))\b[:,\-]?\s*(?:that\s+|about\s+)?(.{2,}?)\s*$/i);
  if (m && m[1].trim().length >= 2) return { kind: "comment", body: m[1].trim().slice(0, 500) };
  return null;
}
