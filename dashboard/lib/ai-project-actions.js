// Phase-2 PROJECT ACTIONS — the one registry describing each AI action that MUTATES a project. Every entry
// is an intent that PREVIEWS, then (only on explicit human confirm) dispatches an EXISTING, self-authorizing
// server action. This file is PURE (no DB, no server calls): it holds the label, the state-availability check
// (so we preview a useful "can't do that yet, because…" instead of letting the real action fail), and the
// human-readable confirm summary. The dispatch to the real server action lives in ai-actions.js, which also
// re-checks authorization. Unit-tested with injected stage facts. Add a Phase-2 action by adding an entry here
// + a dispatch case in ai-actions.js — the preview/confirm/guard plumbing is shared.

import { projectIntel, stageLabel } from "./project-intel.js";

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

  // 2.2 — email the customer a reminder to review + sign the (already-sent) proposal.
  request_signature: {
    verb: "remind",
    cap: null,   // STAFF_EDIT (proposal send) — same gate as send_proposal
    available: (facts) => {
      const s = facts?.proposal_status;
      if (!s || s === "draft") return { ok: false, why: "the proposal hasn't been sent yet" };
      if (facts.proposal_signed) return { ok: false, why: "the proposal is already signed" };
      if (!["sent", "changes_requested", "accepted"].includes(s)) return { ok: false, why: "the proposal isn't in a signable state" };
      return { ok: true };
    },
    confirm: ({ name, email }) => ({
      title: `Send ${name} a signature reminder`,
      detail: `Emails ${email || "the customer"} a link to review and sign.`,
    }),
  },

  // 2.6 — move the project to the NEXT lifecycle stage, but only when the gate is clear. If blocked, the AI
  // REFUSES with the blocker reason (an admin override is a deliberate manual action, never a silent AI move).
  advance_stage: {
    verb: "advance",
    cap: "stage.move",   // admin/manager ONLY — a salesperson may send/remind but may NOT move a stage
    // ctx.order = the project's TYPE-AWARE stage order (from stagesForType) — so the "next stage" we preview
    // and dispatch matches exactly what setStage will accept. A reduced-stage (Type C) project skips stages
    // that MASTER_ORDER has, so we must use its own order, not the global one. canAdvance (the CURRENT stage's
    // gate) is type-independent, so projectIntel supplies it.
    available: (facts, assignments, ctx) => {
      const order = Array.isArray(ctx?.order) && ctx.order.length ? ctx.order : null;
      const stage = facts?.stage;
      const idx = order ? order.indexOf(stage) : -1;
      const nextStage = order && idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
      if (!nextStage) return { ok: false, why: "the project is already at the final stage" };
      const intel = projectIntel(facts || {}, assignments || []);
      if (!intel.canAdvance) { const b = intel.blockers[0]; return { ok: false, why: `it's blocked on "${b.label}" (${b.owner === "customer" ? "the customer's" : "the " + b.owner + "'s"} turn)` }; }
      return { ok: true, data: { nextStage, nextLabel: stageLabel(nextStage) } };
    },
    confirm: ({ name, nextLabel }) => ({
      title: `Advance ${name} to ${nextLabel}`,
      detail: `Moves the project forward to the ${nextLabel} stage.`,
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
  if (/\b(request (?:a )?signature|signature (?:request|reminder)|remind (?:the (?:customer|client)|them) to sign|ask (?:the (?:customer|client)|them) to sign|chase (?:the )?signature|nudge (?:the (?:customer|client)|them) to sign)\b/.test(t))
    return "request_signature";
  if (/\b(advance (?:the |this )?(?:stage|project|step)|move (?:this |the (?:project|stage|step) )?(?:to the next (?:stage|step)|forward)|next stage|push (?:this |it )?(?:to the next stage|forward)|move it forward)\b/.test(t))
    return "advance_stage";
  return null;
}
