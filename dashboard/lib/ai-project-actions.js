// Phase-2 PROJECT ACTIONS — the one registry describing each AI action that MUTATES a project. Every entry
// is an intent that PREVIEWS, then (only on explicit human confirm) dispatches an EXISTING, self-authorizing
// server action. This file is PURE (no DB, no server calls): it holds the label, the state-availability check
// (so we preview a useful "can't do that yet, because…" instead of letting the real action fail), and the
// human-readable confirm summary. The dispatch to the real server action lives in ai-actions.js, which also
// re-checks authorization. Unit-tested with injected stage facts. Add a Phase-2 action by adding an entry here
// + a dispatch case in ai-actions.js — the preview/confirm/guard plumbing is shared.

import { projectIntel, stageLabel } from "./project-intel.js";
import { parseFeedback, feedbackLabel } from "./feedback-model.js";

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

  // 2.3 — record a payment the business has RECEIVED (cash / check / Zelle / card-on-file receipt). This does
  // NOT charge a card. Parameterized: the amount (+ kind) is parsed from the command and shown EXACTLY in the
  // confirm, re-validated server-side on apply. cap="install.pay.edit" → admin/manager only (sales refused).
  record_payment: {
    verb: "record",
    cap: "install.pay.edit",
    available: (facts) => {
      const s = facts?.proposal_status;
      if (!s || s === "draft") return { ok: false, why: "there's no sent proposal to bill against yet" };
      return { ok: true };
    },
    // confirm(ctx, args): args = { amount, kind, label }. Amount + clean label shown; states it records, never charges.
    confirm: ({ name }, args) => ({
      title: `Record a ${moneyStr(args?.amount)} ${args?.label || "payment"} for ${name}`,
      detail: "Records a payment you've RECEIVED (cash / check / Zelle). It does not charge a card.",
    }),
  },

  // 2.4 — assign a technician to the project. Parameterized (tech name → resolved to a user in ai-actions).
  // cap="assignment.edit" (admin/manager only). The CERTIFICATION gate stays enforced by addAssignmentAction:
  // if the tech lacks the required badge the AI REFUSES with the reason — it never auto-overrides.
  assign_tech: {
    verb: "assign",
    cap: "assignment.edit",
    available: () => ({ ok: true }),   // admin/manager may assign at any point; the cert gate runs on apply
    confirm: ({ name }, args) => ({
      title: `Assign ${args?.resolvedName || args?.techName || "a technician"} to ${name}`,
      detail: "Adds them to the project as the assigned technician.",
    }),
  },

  // 2.5 — close an EXISTING open install-issue flag: resolve (fixed/accepted) or dismiss (not an issue). It
  // never hard-deletes (the row is kept for audit) and never RAISES a new flag — creating one needs a device
  // reference from the survey/QC model (Phase 4), so Phase 2 wires adjudication only. cap="issue.adjudicate"
  // (admin/manager — a 5th distinct cap). Parameterized: { decision, issueId?, label? }. The open issue set
  // is threaded via ctx.openIssues; the preview binds the exact issue (clarifying when several are open).
  adjudicate_issue: {
    verb: "resolve",
    cap: "issue.adjudicate",
    available: (facts, assignments, ctx) => {
      const open = Array.isArray(ctx?.openIssues) ? ctx.openIssues : [];
      if (!open.length) return { ok: false, why: "there are no open issues to close" };
      return { ok: true };
    },
    confirm: ({ name }, args) => {
      const dismiss = args?.decision === "dismiss";
      const what = args?.label ? `the ${args.label} issue` : "the install issue";
      return {
        title: `${dismiss ? "Dismiss" : "Resolve"} ${what} on ${name}`,
        detail: dismiss
          ? "Marks the flag dismissed — kept on the record for audit, never deleted."
          : "Marks the install issue resolved — kept on the record for audit.",
      };
    },
  },

  // 2.5 — RAISE a new install issue against a specific survey DEVICE ("flag camera 3 — wrong location"). The
  // device reference is resolved to a stable device id in ai-actions (via the reusable device resolver over
  // the survey model); ambiguous → clarify, unknown → clarify, never a guess. cap="issue.report" — the one
  // write a TECHNICIAN may do (admin/manager/tech); it grants NO proposal/payment/stage rights. Dispatches
  // the existing reportInstallIssueAction (which self-authorizes ISSUE_REPORTERS + whitelists the reason).
  raise_issue: {
    verb: "flag",
    cap: "issue.report",
    available: () => ({ ok: true }),   // reportable whenever there are devices; resolution happens on preview
    // confirm(ctx, args): args = { deviceId, deviceLabel, reason, note }. Shows WHICH device + WHY.
    confirm: ({ name }, args) => ({
      title: `Flag ${args?.deviceLabel || "a device"} on ${name}${args?.reason && args.reason !== "Other" ? ` — ${args.reason}` : ""}`,
      detail: "Raises an install issue on this device for admin/manager review. Nothing is changed on the device.",
    }),
  },

  // 3.2 — capture a categorized customer objection/feedback item, optionally bound to a specific device. The
  // device reference (if any) is resolved in ai-actions. cap:null → editor (admin/manager/sales own customer
  // conversations). Non-destructive internal note that enters an open→reviewed→resolved review lifecycle.
  capture_feedback: {
    verb: "log",
    cap: null,
    available: () => ({ ok: true }),
    // confirm(ctx, args): args = { kind, body, deviceId?, deviceLabel? }.
    confirm: ({ name }, args) => ({
      title: `Log ${feedbackLabel(args?.kind)}${args?.deviceLabel ? ` on ${args.deviceLabel}` : ""} for ${name}`,
      detail: args?.body ? `"${String(args.body).slice(0, 140)}" — recorded for review (open).` : "Records this for review (open).",
    }),
  },
};

// Issue-reason keywords → the canonical ISSUE_REASONS taxonomy (install-checklist-model). Order matters:
// the most specific phrase wins. Unmatched → "Other" (never invented).
const REASON_MAP = [
  [/\bwrong (?:location|spot|place|position)|misplaced|wrong(?:ly)? placed\b/, "Wrong location"],
  [/\bwrong (?:device|model|unit|camera|part)\b/, "Wrong device"],
  [/\bpoor|sloppy|workmanship|messy|bad install\b/, "Poor workmanship"],
  [/\b(?:failed|fails|failing) (?:a )?test|not working|doesn'?t work|offline|no signal|no feed|dead\b/, "Failed test"],
  [/\bmissing (?:material|part|cable|mount|hardware)|no material\b/, "Missing material"],
  [/\bincomplete|unfinished|not finished|half(?:-| )?done\b/, "Incomplete"],
  [/\bblocked|obstructed|in the way|can'?t reach\b/, "Blocked"],
  [/\bdamaged|broken|cracked|smashed|destroyed\b/, "Damaged"],
];
export function reasonFromText(text) {
  const t = String(text || "").toLowerCase();
  for (const [re, label] of REASON_MAP) if (re.test(t)) return label;
  return "Other";
}

const moneyStr = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Parse a payment command → { amount, kind } or null. Requires a record/log verb (or deposit/balance noun)
// AND a positive dollar amount, so plain talk about money isn't misread as a command.
export function parsePayment(text) {
  const t = String(text || "").toLowerCase();
  const verbish = /\b(record|log|mark|enter|take|received|collected|got)\b/.test(t);
  const payword = /\b(payment|deposit|balance|paid)\b/.test(t);
  if (!(verbish && (payword || /\$/.test(t)))) return null;
  // Prefer a $-prefixed amount; only then fall back to the first bare number — so "invoice 7 for $500"
  // records $500, not $7.
  const m = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/) || t.match(/\b([\d,]+(?:\.\d{1,2})?)\b/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!(amount > 0)) return null;
  // DB kinds are { deposit, final, partial, other }; keep a clean user-facing label separate from the stored
  // kind so a "balance"/generic payment isn't silently coerced to "deposit".
  let kind = "partial", label = "payment";
  if (/\bdeposit\b/.test(t)) { kind = "deposit"; label = "deposit"; }
  else if (/\b(balance|final)\b/.test(t)) { kind = "final"; label = "final balance"; }
  return { amount, kind, label };
}

export const ACTION_NAMES = Object.keys(PROJECT_ACTIONS);

// Is this action permitted for a caller? The per-action `cap` IS the authority when set: the action is
// allowed iff `can(cap)` — so authorization to one action never implies another, and a capability can admit
// a role the blanket editor gate wouldn't (a technician may `raise_issue` via issue.report, yet gains NO
// proposal/payment/stage rights — those actions carry caps a tech lacks). A cap-less action (send/remind)
// falls back to the editor gate (AI_EDITORS = admin/manager/sales). Pure: caller injects { editor, can }.
export function actionAllowed(name, { editor, can } = {}) {
  const spec = PROJECT_ACTIONS[name];
  if (!spec) return false;
  if (spec.cap) return typeof can === "function" && can(spec.cap);
  return !!editor;
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

// Parse an "assign a tech" command → { techName } or null. Captures the person's name after assign/put/add;
// ai-actions resolves it to a real user (and refuses if there's no such tech).
export function parseAssign(text) {
  const t = String(text || "").trim();
  const m = t.match(/\b(?:assign|put|add)\s+(?:the\s+)?(?:tech(?:nician)?\s+)?([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)?)/i);
  if (!m) return null;
  let techName = m[1].replace(/\s+(to|on|this|the|that|for|as)$/i, "").trim();
  if (techName.length < 2 || /^(it|me|this|the|them|someone|a|an|tech|technician)$/i.test(techName)) return null;
  return { techName };
}

// Parse an "adjudicate an issue" command → { decision:"resolve"|"dismiss", issueId? } or null. Requires an
// issue/flag NOUN so it can't swallow unrelated "resolve"/"close" talk, plus an explicit resolve/dismiss verb.
export function parseAdjudicate(text) {
  const t = String(text || "").toLowerCase().trim();
  // A status QUESTION ("is the issue resolved?", "did we resolve it", "has issue 12 been closed") is not a
  // command — bail on an interrogative lead or a trailing "?" so we never raise a confirm card for a query.
  if (/^(is|was|are|were|did|do|does|has|have|had|which|what|how|why|when|can|could|should|will|would)\b/.test(t) || /\?\s*$/.test(t)) return null;
  if (!/\b(issues?|flags?|defects?|punch(?:\s*list)?|tickets?)\b/.test(t)) return null;
  let decision = null;
  if (/\b(dismiss|dismissed|ignore|reject|waive|discard)\b/.test(t)) decision = "dismiss";
  else if (/\b(resolve|resolved|close|cleared?|complete[d]?|mark(?:ed)?\s+(?:it\s+)?(?:as\s+)?(?:resolved|closed|done|fixed))\b/.test(t)) decision = "resolve";
  if (!decision) return null;
  const m = t.match(/\b(?:issues?|flags?|tickets?)\s*#?\s*(\d+)\b/) || t.match(/#\s*(\d+)\b/);
  const issueId = m ? Number(m[1]) : null;
  return issueId ? { decision, issueId } : { decision };
}

// Parse a "raise/flag an install issue on a device" command → { ref, reason, note } or null. `ref` is the
// FULL utterance (the device resolver strips noise and finds the device); `reason` maps to the taxonomy;
// `note` keeps the human's words for context. Requires a flag/report verb or a problem phrase, and is NOT a
// question, NOT a resolve/dismiss (those are adjudicate_issue), and NOT a plain "any issues?" read.
export function parseRaiseIssue(text) {
  const t = String(text || "").toLowerCase();
  if (/^(is|are|was|were|did|do|does|has|have|which|what|how|why|when|can|could|should|would)\b/.test(t) || /\?\s*$/.test(t)) return null;
  if (/\b(resolve|resolved|dismiss|dismissed|close|closed|clear)\b/.test(t)) return null;   // → adjudicate, not raise
  const verb = /\b(flag|report|raise|log|open)\b/.test(t);
  const problem = /\b(problem|broken|damaged|not working|doesn'?t work|wrong|missing|incomplete|failed|offline|cracked|obstructed|blocked)\b/.test(t);
  if (!(verb || problem)) return null;
  // Must plausibly reference a device — a kind word or a number — else it's generic ("report a problem") and
  // the resolver would have nothing to go on. Keep it broad; resolution + clarify happen server-side.
  const deviceish = /\b(camera|cam|cctv|nvr|recorder|speaker|amp|display|monitor|tv|door|window|sensor|motion|glass|keypad|fire|smoke|kiosk|printer|pos|terminal|switch|router|device|entrance|front|back|left|right)\b/.test(t) || /\b\d+\b/.test(t);
  if (!deviceish) return null;
  return { ref: String(text), reason: reasonFromText(text), note: String(text).trim().slice(0, 500) };
}

// Unified action detector for the router: a param-less action name, OR a parameterized action with args.
// Returns { name, args? } | null. Order: adjudicate (resolve/dismiss) is tried before raise (flag) so a
// "resolve the issue" never reads as a new flag; raise_issue is last so it doesn't shadow the others.
export function detectAction(text) {
  const name = actionFromText(text);
  if (name) return { name };
  const pay = parsePayment(text);
  if (pay) return { name: "record_payment", args: pay };
  const asn = parseAssign(text);
  if (asn) return { name: "assign_tech", args: asn };
  const adj = parseAdjudicate(text);
  if (adj) return { name: "adjudicate_issue", args: adj };
  // Feedback BEFORE raise: "log the objection about the entrance camera" is feedback, not an install flag;
  // parseFeedback excludes flag/raise phrasings, so "flag camera 3" still falls through to raise_issue.
  const fb = parseFeedback(text);
  if (fb) return { name: "capture_feedback", args: fb };
  const raise = parseRaiseIssue(text);
  if (raise) return { name: "raise_issue", args: raise };
  return null;
}
