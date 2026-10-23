"use server";

// AI command center — server actions (Phase 1, proposal builder). The client sends plain text; these
// re-derive the caller from cookies, enforce the staff role, interpret the text (deterministic router
// first, Haiku only as a fallback), and PREVIEW every write. The actual mutation runs through the same
// role-guarded paths the builder uses (saveProposalDraft / addProjectNote) and is re-computed server-side
// from the CURRENT stored proposal, so a stale or forged client intent can never drive it. Every applied
// command is written to the Job Log (kind "ai"). Gated behind the AI_COMMANDS vault flag + ANTHROPIC_API_KEY.
import { headers } from "next/headers";
import {
  getActiveProposal, addProjectNote, logProjectEvent,
  searchProjects, actorName, secretValue,
  getJobByAccessId, getReceivables, getVisibleJobs,
  buildStageFacts, getProjectAssignments, getProjectFinancialState, listInstallIssues,
} from "../../../lib/db";
import { optionTotals, priceOf } from "../../../lib/proposal";
import { can } from "../../../lib/roles";
import { routeCommand, applyIntentToPayload, buildClaudeBody, parseClaudeResult } from "../../../lib/ai-command";
import { runQuery } from "../../../lib/ai-answer";
import { aiGate, aiCanEdit } from "../../../lib/ai-authz";
import { PROJECT_ACTIONS, actionAllowed } from "../../../lib/ai-project-actions";
import { sendProposalAction } from "./proposal-actions";
import { resolveAppRoute, looksLikeEdit } from "../../../lib/ai-global";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Intents that MUTATE — only AI_EDITORS (admin/manager/sales) may run them; a tech in the assistant is read-only.
const WRITE_INTENTS = new Set(["add_items", "set_discount", "edit_item", "set_desc", "reorder_section", "add_note"]);

// Same session-role resolution the proposal actions use (cookie token, then PIN-scoped access cookie).
async function getSessionRole() {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const getC = (name) => cookie.split(";").find((c) => c.trim().startsWith(name + "="))?.split("=").slice(1).join("=");
  const { parseToken, parseAccessToken } = await import("../../../lib/auth");
  const raw = getC("iot_session");
  if (raw) { const tok = await parseToken(raw.trim()); if (tok?.role) return tok; }
  const acc = getC("iot_access");
  if (acc) { const at = await parseAccessToken(acc.trim()); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}

const flagOn = () => secretValue("AI_COMMANDS") === "on";
const grandOf = (payload, row) => (payload.options || []).reduce((a, o) => a + optionTotals(o, +row.tax_rate || 0, payload.discount, +row.deposit_pct || 50, 0).grand, 0);

// The single authorization funnel every action runs first: resolve the caller, then aiGate(role, flag).
async function authorize() {
  const tok = await getSessionRole();
  return { tok, ...aiGate(tok, flagOn()) };
}

// Is the feature live for this caller? Drives whether the command bar renders at all.
export async function aiStatusAction() {
  const tok = await getSessionRole();
  return { enabled: aiGate(tok, flagOn()).ok, hasKey: !!secretValue("ANTHROPIC_API_KEY") };
}

// Router first (0 tokens); only unrouted text hits Haiku. Returns { intent, noKey }.
async function interpret(text, context) {
  const routed = routeCommand(text);
  if (routed) return { intent: routed };
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return { intent: { type: "unknown" }, noKey: true };
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(buildClaudeBody(text, context)),
    });
    if (!res.ok) return { intent: { type: "unknown" } };
    return { intent: parseClaudeResult(await res.json()) };
  } catch { return { intent: { type: "unknown" } }; }
}

// Run a read-only "answer" intent: retrieve real data (authorized, via existing db functions) and return
// the answer TEXT — never invented. Ambiguous → a clarify question; permission/no-data/error carry a
// `reason` for the (future) training loop. Shared by the proposal bar and the global ⌘K bar.
function answerFor(intent, tok, currentAccessId) {
  const ctx = {
    role: tok.role, userId: tok.id, userName: actorName(tok), currentAccessId: currentAccessId || null, can,
    db: { getActiveProposal, getJobByAccessId, getReceivables, getVisibleJobs, searchProjects,
          buildStageFacts, getProjectAssignments, getProjectFinancialState, listInstallIssues },
    fin: { optionTotals },
  };
  const r = runQuery(intent, ctx);
  if (r.error) {
    const kind = r.reason === "ambiguous" ? "clarify" : r.reason === "permission" ? "unsupported" : r.reason === "no_data" ? "answer" : "unanswered";
    return { ok: true, kind, speak: r.error, reason: r.reason };
  }
  // Carry the resolved project back so the client's memory can track it — a later "it"/"that customer"
  // then resolves even though no navigation happened.
  return { ok: true, kind: "answer", speak: r.text, facts: r.facts || [], project: r.project || null };
}

// Preview a Phase-2 project ACTION: editor-only, and AVAILABLE given the project's CURRENT state (so we show
// "can't yet, because…" instead of letting the real action fail). Returns a confirmable write — the mutation
// runs only on explicit human apply, through the existing self-authorizing server action.
function previewAction(name, accessId, tok) {
  const spec = PROJECT_ACTIONS[name];
  if (!spec) return { ok: true, kind: "unsupported", speak: "I can't do that action yet.", reason: "unsupported_action" };
  // Editor role AND the action's specific capability (sending ≠ paying ≠ moving a stage).
  if (!actionAllowed(name, { editor: aiCanEdit(tok.role), can: (c) => can(tok.role, c) }))
    return { ok: true, kind: "unsupported", speak: "Your role can't do that action.", reason: "permission" };
  if (!accessId) return { ok: true, kind: "unsupported", speak: "Open a project first." };
  const facts = buildStageFacts(accessId);
  if (!facts) return { error: "Couldn't read this project." };
  const avail = spec.available ? spec.available(facts) : { ok: true };
  if (!avail.ok) return { ok: true, kind: "unsupported", speak: `I can't do that yet — ${avail.why}.`, reason: "not_available" };
  // Show WHO it goes to + the amount so the human knows exactly what they're confirming.
  const job = getJobByAccessId(accessId);
  const prev = spec.confirm(actionContext(job, accessId));
  // intent.accessId BINDS the confirm to this exact project — apply dispatches against it, never "whatever
  // project happens to be open now", so a preview can't be replayed against a different project.
  return { ok: true, kind: "write", write: "action", intent: { type: "action", name, accessId }, preview: { title: prev.title, body: prev.detail } };
}

// Recipient + amount for an action's confirm copy (retail total of the current proposal, for the human).
function actionContext(job, accessId) {
  const name = job?.customer || "this project";
  const email = job?.contact_email || null;
  let total = null;
  try {
    const prop = getActiveProposal(accessId);
    if (prop?.payload) { const pl = JSON.parse(prop.payload); const opt = (pl.options || []).find((o) => o.id === prop.selected_option) || (pl.options || [])[0];
      if (opt) { const g = optionTotals(opt, +prop.tax_rate || 0, pl.discount, +prop.deposit_pct || 50, pl.pcp_credit).grand; total = "$" + (Math.round(g * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }
  } catch { /* no total → omit it */ }
  return { name, email, total };
}

// Apply a confirmed Phase-2 action. Re-derives the caller, re-checks editor role + the action's capability AND
// current-state availability (never trusts a stale client intent), dispatches the EXISTING guarded server
// action, audits. `accessId` is the intent's bound project (the one previewed), re-validated here.
export async function aiApplyProjectActionAction(accessId, name) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  const spec = PROJECT_ACTIONS[name];
  if (!spec) return { error: "Unknown action." };
  if (!actionAllowed(name, { editor: aiCanEdit(g.tok.role), can: (c) => can(g.tok.role, c) }))
    return { error: "Your role can't do that action." };
  if (!accessId || !getJobByAccessId(accessId)) return { error: "Couldn't find that project." };
  const facts = buildStageFacts(accessId);
  if (!facts) return { error: "Couldn't read this project." };
  const avail = spec.available ? spec.available(facts) : { ok: true };
  if (!avail.ok) return { error: `Can't do that — ${avail.why}.` };   // state changed since preview → refuse

  let out, message;
  if (name === "send_proposal") { out = await sendProposalAction(accessId); message = "Proposal sent."; }
  else return { error: "That action isn't wired yet." };
  if (out?.error) return { error: out.error };

  logProjectEvent(accessId, { kind: "ai", label: `AI: ${name} — by ${actorName(g.tok)}`, actor: actorName(g.tok) });
  try { const { revalidatePath } = await import("next/cache"); revalidatePath(`/project/${accessId}`); } catch {}
  return { ok: true, message };
}

// Classify a result we couldn't turn into an action/answer, so the response is useful AND the future
// self-improvement system has a signal. A QUESTION we couldn't retrieve → "unanswered" (company knowledge,
// Phase 2); anything else → "unknown". Never a bare "I don't know" when we can say what we CAN do.
const CAPS_LINE = "I can look up a proposal total, a project's status, which proposals are unsigned, or what's in QC — or edit a proposal and open a project.";
function classifyMiss(text, noKey) {
  const t = String(text || "").trim();
  const isQuestion = /\?\s*$/.test(t) || /^(what|how|why|when|who|which|where|is|are|does|do|can|could|should|will|would|has|have)\b/i.test(t);
  if (isQuestion) return { ok: true, kind: "unanswered", reason: "company_knowledge", speak: `I don't have that answer yet. ${CAPS_LINE}` };
  return { ok: true, kind: "unknown", noKey: !!noKey };
}

// Read-only: text → a validated intent + a human preview. Writes nothing.
export async function aiInterpretAction(accessId, text, context = {}) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  const t = String(text || "").trim();
  if (!t) return { error: "Type a command." };

  const { intent, noKey } = await interpret(t, context);

  // A write intent from a role that may be IN the assistant but may not EDIT (e.g. a technician) is refused
  // with a clear reason — never silently attempted. Reads/navigation below stay available to them.
  if (WRITE_INTENTS.has(intent.type) && !aiCanEdit(g.tok.role))
    return { ok: true, kind: "unsupported", speak: "You can view this project, but editing the proposal is limited to sales and managers.", reason: "permission" };

  if (intent.type === "navigate_project") {
    const hits = (searchProjects(intent.query) || []).slice(0, 5);
    if (!hits.length) return { ok: true, kind: "none", speak: `No project matching "${intent.query}".` };
    const top = hits[0];
    return { ok: true, kind: "navigate", href: `/project/${top.access_id}`, label: top.customer || top.access_id, more: hits.length - 1 };
  }

  if (intent.type === "navigate_section") {
    const href = `/project/${accessId}?stage=${intent.stage}${intent.open ? `&open=${intent.open}` : ""}`;
    return { ok: true, kind: "navigate", href, label: intent.label };
  }

  if (intent.type === "add_note") {
    return { ok: true, kind: "write", write: "note", intent, preview: { title: "Add project note", body: intent.body } };
  }

  if (["add_items", "set_discount", "edit_item", "set_desc", "reorder_section"].includes(intent.type)) {
    return proposalPreview(accessId, intent);
  }

  if (intent.type === "action") return previewAction(intent.name, accessId, g.tok);

  if (intent.type === "answer") return answerFor(intent, g.tok, accessId || context.memory?.project?.accessId);
  if (intent.type === "clarify") return { ok: true, kind: "clarify", speak: intent.ask };
  if (intent.type === "unsupported") return { ok: true, kind: "unsupported", speak: intent.reason || CAPS_LINE, reason: "unsupported_action" };
  return classifyMiss(t, noKey);
}

// Preview a proposal-editing intent against the CURRENT stored proposal. A rename/move that matches more
// than one line item comes back as a disambiguation (candidates to pick) rather than a guess.
function proposalPreview(accessId, intent) {
  const row = getActiveProposal(accessId);
  if (!row) return { error: "There's no proposal on this project yet." };
  if (row.signed_name || row.status === "accepted") return { error: "This proposal is signed — revise it before editing." };
  let payload; try { payload = JSON.parse(row.payload); } catch { return { error: "Couldn't read the proposal." }; }
  // Resolve a book price into the intent so the client applies the EXACT same numbers it previewed.
  if (intent.type === "add_items" && intent.price == null) intent.price = +priceOf(intent.name) || 0;
  const applied = applyIntentToPayload(payload, intent, { priceOf });
  if (applied.ambiguous) return { ok: true, kind: "disambiguate", intent, action: applied.action, candidates: applied.ambiguous };
  if (applied.error) return { error: applied.error };
  // Only show the money line when the total actually moves (a rename / reorder / description leaves it
  // unchanged). A description edit shows the written blurb so staff can read it before it's applied.
  const before = grandOf(payload, row), after = grandOf(applied.payload, row);
  const preview = { title: applied.summary };
  if (applied.desc) preview.body = applied.desc;
  if (before !== after) { preview.before = before; preview.after = after; }
  return { ok: true, kind: "write", write: "proposal", intent, preview };
}

// The signer picked a specific candidate for an ambiguous rename/move — force the match to that id and
// return the concrete write preview (no Claude re-parse).
export async function aiResolvePickAction(accessId, intent, pickedId) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  if (!intent || intent.type !== "edit_item" || !pickedId) return { error: "Nothing to resolve." };
  return proposalPreview(accessId, { ...intent, match: { id: String(pickedId) } });
}

// A proposal edit (add_items / set_discount) is applied to the builder's live payload with the SAME pure
// applyIntentToPayload the preview used, then persisted by the builder's own role-guarded, payload-validated
// autosave (saveProposalDraftAction) — so this records the audit line once the edit is confirmed.
export async function aiAuditAction(accessId, summary) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  logProjectEvent(accessId, { kind: "ai", label: `AI: ${String(summary || "command").slice(0, 160)} — by ${actorName(g.tok)}`, actor: actorName(g.tok) });
  return { ok: true };
}

// GLOBAL command center: navigation anywhere in the staff app. App routes resolve with ZERO tokens; the
// shared interpreter then handles "open <customer/project>" and, when a project is in context, jumping to
// its sections. It never edits data — an edit phrasing is pointed back to the project's own bar.
export async function aiGlobalInterpretAction(text, context = {}) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  const t = String(text || "").trim();
  if (!t) return { error: "Type a command." };

  // A data question the 0-token router recognizes ("which projects need QC", "how much is X's proposal")
  // is an ANSWER, not a page jump — resolve it BEFORE the loose app-route map can grab a word like
  // "projects". Only answer/clarify are intercepted; navigation phrasings still fall to the app routes.
  const peek = routeCommand(t);
  if (peek?.type === "answer") return answerFor(peek, g.tok, context.currentAccessId || context.memory?.project?.accessId);
  if (peek?.type === "clarify") return { ok: true, kind: "clarify", speak: peek.ask };

  const app = resolveAppRoute(t);
  if (app) return { ok: true, kind: "navigate", href: app.href, label: app.label };

  const { intent, noKey } = await interpret(t, context);
  // A question → retrieve + answer directly (don't navigate). This is what makes it an assistant, not a bar.
  // With no page project, the last project the assistant resolved (memory) is the referent for "it"/"that".
  if (intent.type === "answer") return answerFor(intent, g.tok, context.currentAccessId || context.memory?.project?.accessId);
  if (intent.type === "clarify") return { ok: true, kind: "clarify", speak: intent.ask };
  if (intent.type === "action") {
    const acc = context.currentAccessId || context.memory?.project?.accessId;
    if (!acc) return { ok: true, kind: "unsupported", speak: "Open a project first, then I can do that." };
    return previewAction(intent.name, acc, g.tok);
  }
  if (intent.type === "navigate_project") {
    const hits = (searchProjects(intent.query) || []).slice(0, 5);
    if (!hits.length) return { ok: true, kind: "none", speak: `No project matching "${intent.query}".` };
    const top = hits[0];
    return { ok: true, kind: "navigate", href: `/project/${top.access_id}`, label: top.customer || top.access_id, more: hits.length - 1 };
  }
  if (intent.type === "navigate_section") {
    if (!context.currentAccessId) return { ok: true, kind: "unsupported", speak: "Open a project first, then jump to its sections." };
    return { ok: true, kind: "navigate", href: `/project/${context.currentAccessId}?stage=${intent.stage}${intent.open ? `&open=${intent.open}` : ""}`, label: intent.label };
  }
  if (WRITE_INTENTS.has(intent.type)) {
    if (!aiCanEdit(g.tok.role)) return { ok: true, kind: "unsupported", speak: "Editing a proposal is limited to sales and managers.", reason: "permission" };
    // A real target exists → offer to open the proposal (where the edit bar lives), rather than telling
    // them to open a project they may already be viewing. No project in context → a concise nudge.
    if (context.currentAccessId) return { ok: true, kind: "navigate", href: `/project/${context.currentAccessId}?stage=proposal&open=proposal`, label: "the proposal" };
    return { ok: true, kind: "unsupported", speak: "Open a project’s proposal to edit it." };
  }
  if (intent.type === "unsupported") return { ok: true, kind: "unsupported", speak: intent.reason || "I can point you somewhere — try Tickets, Inventory, Customers or Finances." };
  // We couldn't fully parse it, but on a project an edit-ish phrasing ("rename a camera") should still take
  // the user to the proposal — the ⌘K bar only navigates; the edit itself is done with the proposal's bar.
  if (context.currentAccessId && looksLikeEdit(t)) return { ok: true, kind: "navigate", href: `/project/${context.currentAccessId}?stage=proposal&open=proposal`, label: "the proposal" };
  return classifyMiss(t, noKey);
}

// Apply an add_note command.
export async function aiApplyNoteAction(accessId, body) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  const text = String(body || "").trim();
  if (text.length < 2) return { error: "The note is empty." };
  addProjectNote(accessId, { role: g.tok.role, name: actorName(g.tok), body: text, scope: "general", isPublic: false });
  logProjectEvent(accessId, { kind: "ai", label: `AI: note added — by ${actorName(g.tok)}`, actor: actorName(g.tok) });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}
