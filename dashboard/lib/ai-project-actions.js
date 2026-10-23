// Phase-2 PROJECT ACTIONS — the one registry describing each AI action that MUTATES a project. Every entry
// is an intent that PREVIEWS, then (only on explicit human confirm) dispatches an EXISTING, self-authorizing
// server action. This file is PURE (no DB, no server calls): it holds the label, the state-availability check
// (so we preview a useful "can't do that yet, because…" instead of letting the real action fail), and the
// human-readable confirm summary. The dispatch to the real server action lives in ai-actions.js, which also
// re-checks authorization. Unit-tested with injected stage facts. Add a Phase-2 action by adding an entry here
// + a dispatch case in ai-actions.js — the preview/confirm/guard plumbing is shared.

export const PROJECT_ACTIONS = {
  // 2.1 — email the current (draft) proposal to the customer and move the project to Sent.
  send_proposal: {
    verb: "send",
    // Per-action capability (checked IN ADDITION to the editor role). null = editor is the gate; sending a
    // proposal is a STAFF_EDIT action (admin/manager/sales). Payment/stage actions set a stricter cap, so
    // being authorized to SEND never implies being authorized to record a payment or move a stage.
    cap: null,
    // Available only when there's a DRAFT proposal to send (not missing, not already sent/accepted).
    available: (facts) => {
      const s = facts?.proposal_status;
      if (!s) return { ok: false, why: "there isn't a proposal to send yet" };
      if (s !== "draft") return { ok: false, why: "the proposal has already been sent" };
      return { ok: true };
    },
    // ctx = { name, email, total } so the human sees WHO it goes to and the amount before confirming.
    confirm: ({ name, email, total }) => ({
      title: `Send ${name}'s proposal to the customer`,
      detail: `Emails ${email || "the customer"}${total ? ` · ${total}` : ""} and moves the project to Sent.`,
    }),
  },
};

export const ACTION_NAMES = Object.keys(PROJECT_ACTIONS);

// Is this action permitted for a caller? An editor role is NECESSARY; a per-action `cap` (when set) is ALSO
// required — so authorization to one action never implies another (a salesperson who may send a proposal does
// not thereby gain payment or stage-move rights). Pure: the caller injects { editor:boolean, can:(cap)=>bool }.
export function actionAllowed(name, { editor, can } = {}) {
  const spec = PROJECT_ACTIONS[name];
  if (!spec || !editor) return false;
  if (spec.cap && !(typeof can === "function" && can(spec.cap))) return false;
  return true;
}

// Resolve a spoken/written action phrase to an action name (0-token). Returns a name or null.
export function actionFromText(text) {
  const t = String(text || "").toLowerCase().trim();
  if (/^(?:go ahead and |please |can you )?send (?:the |this |it |out )*(?:proposal|quote)(?: (?:out )?to (?:the )?customer)?[.?!]*$/.test(t)
    || /^send it (?:out )?to (?:the )?customer[.?!]*$/.test(t))
    return "send_proposal";
  return null;
}
