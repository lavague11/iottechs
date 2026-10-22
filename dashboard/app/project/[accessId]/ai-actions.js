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
} from "../../../lib/db";
import { optionTotals, priceOf } from "../../../lib/proposal";
import { routeCommand, applyIntentToPayload, buildClaudeBody, parseClaudeResult } from "../../../lib/ai-command";
import { aiGate } from "../../../lib/ai-authz";
import { resolveAppRoute } from "../../../lib/ai-global";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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

// Read-only: text → a validated intent + a human preview. Writes nothing.
export async function aiInterpretAction(accessId, text, context = {}) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  const t = String(text || "").trim();
  if (!t) return { error: "Type a command." };

  const { intent, noKey } = await interpret(t, context);

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

  if (intent.type === "unsupported") return { ok: true, kind: "unsupported", speak: intent.reason || "That's a later phase — Phase 1 covers proposal edits, notes and opening a project." };
  return { ok: true, kind: "unknown", noKey: !!noKey };
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

  const app = resolveAppRoute(t);
  if (app) return { ok: true, kind: "navigate", href: app.href, label: app.label };

  const { intent, noKey } = await interpret(t, { recent: context.recent });
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
  if (["add_items", "edit_item", "set_desc", "set_discount", "reorder_section", "add_note"].includes(intent.type)) {
    // A real target exists → offer to open the proposal (where the edit bar lives), rather than telling
    // them to open a project they may already be viewing. No project in context → a concise nudge.
    if (context.currentAccessId) return { ok: true, kind: "navigate", href: `/project/${context.currentAccessId}?stage=proposal&open=proposal`, label: "the proposal" };
    return { ok: true, kind: "unsupported", speak: "Open a project’s proposal to edit it." };
  }
  if (intent.type === "unsupported") return { ok: true, kind: "unsupported", speak: intent.reason || "I can point you somewhere — try Tickets, Inventory, Customers or Finances." };
  return { ok: true, kind: "unknown", noKey: !!noKey };
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
