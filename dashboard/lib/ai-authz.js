// Authorization for the AI command actions (app/project/[accessId]/ai-actions.js). Pure + node-testable:
// the server actions re-derive the caller's session role from cookies and read the AI_COMMANDS flag, then
// hand both to aiGate() here for the yes/no decision. The AI command center is STAFF-ONLY — admin,
// manager and sales, the same roles that may edit a proposal. A customer, tech, readonly or unauthenticated
// caller is refused outright, and NOTHING runs while the flag is off. Keeping this one function as the only
// authority means every action authorizes identically, and the rule can be unit-tested without Next.
export const AI_STAFF = Object.freeze(new Set(["admin", "manager", "sales"]));

export function aiStaff(role) { return AI_STAFF.has(String(role || "")); }

// tok  = the resolved session ({ role, ... }) or null; flagOn = whether AI_COMMANDS is enabled.
// Returns { ok:true } when the caller may use AI commands, else { ok:false, error } with a safe message.
// Role is checked before the flag so a non-staff caller never learns whether the feature is turned on.
export function aiGate(tok, flagOn) {
  if (!tok || !AI_STAFF.has(tok.role)) return { ok: false, error: "Unauthorized." };
  if (!flagOn) return { ok: false, error: "AI commands are off." };
  return { ok: true };
}
