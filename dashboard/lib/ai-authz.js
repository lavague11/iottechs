// Authorization for the AI command actions (app/project/[accessId]/ai-actions.js). Pure + node-testable:
// the server actions re-derive the caller's session role from cookies and read the AI_COMMANDS flag, then
// hand both to aiGate() here for the yes/no decision. The AI command center is STAFF-ONLY — admin, manager,
// sales and tech. A customer, vendor, readonly or unauthenticated caller is refused outright, and NOTHING
// runs while the flag is off. Keeping this one function as the only authority means every action authorizes
// identically, and the rule can be unit-tested without Next.
//
// Being allowed IN is not being allowed to do everything: reads are capability-gated per query (ai-answer.js),
// and WRITES are limited to AI_EDITORS. A technician may ask (status, their own payout) but may NOT edit a
// proposal or move a stage through the AI.
export const AI_STAFF = Object.freeze(new Set(["admin", "manager", "sales", "tech"]));
export const AI_EDITORS = Object.freeze(new Set(["admin", "manager", "sales"]));   // who may run a WRITE intent

export function aiStaff(role) { return AI_STAFF.has(String(role || "")); }
export function aiCanEdit(role) { return AI_EDITORS.has(String(role || "")); }

// tok  = the resolved session ({ role, ... }) or null; flagOn = whether AI_COMMANDS is enabled.
// Returns { ok:true } when the caller may use AI commands, else { ok:false, error } with a safe message.
// Role is checked before the flag so a non-staff caller never learns whether the feature is turned on.
export function aiGate(tok, flagOn) {
  if (!tok || !AI_STAFF.has(tok.role)) return { ok: false, error: "Unauthorized." };
  if (!flagOn) return { ok: false, error: "AI commands are off." };
  return { ok: true };
}
