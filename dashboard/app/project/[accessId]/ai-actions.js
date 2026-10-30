"use server";

// AI command center — server actions (Phase 1, proposal builder). The client sends plain text; these
// re-derive the caller from cookies, enforce the staff role, interpret the text (deterministic router
// first, Haiku only as a fallback), and PREVIEW every write. The actual mutation runs through the same
// role-guarded paths the builder uses (saveProposalDraft / addProjectNote) and is re-computed server-side
// from the CURRENT stored proposal, so a stale or forged client intent can never drive it. Every applied
// command is written to the Job Log (kind "ai"). Gated behind the AI_COMMANDS vault flag + ANTHROPIC_API_KEY.
import { headers } from "next/headers";
import {
  getActiveProposal, addProjectNote, logProjectEvent, getProjectEvents,
  searchProjects, actorName, secretValue,
  getJobByAccessId, getReceivables, getVisibleJobs,
  buildStageFacts, getProjectAssignments, getProjectFinancialState, listInstallIssues, resolveTechByName,
  getSupportArticles, getProjectDevices, openInstallIssues, getToolData, listFeedback, reviseProposal,
  customerOwnsProjectAccount, addFeedbackNote,
  recordAiUsage, aiSpendTodayCents, aiSpendCapCents, aiSpendAlertPct, notifyRoles,
} from "../../../lib/db";
import { findKnowledge } from "../../../lib/ai-knowledge";
import { customerReadIntent, customerActionIntent } from "../../../lib/ai-customer";
import { resolveDevice, candidateView } from "../../../lib/device-resolver";
import { describeCoverage } from "../../../lib/device-coverage";
import { FEEDBACK_KINDS } from "../../../lib/feedback-model";
import { optionTotals, priceOf } from "../../../lib/proposal";
import { can } from "../../../lib/roles";
import { routeCommand, applyIntentToPayload, buildClaudeBody, parseClaudeResult, pickModel } from "../../../lib/ai-command";
import { costCents, crossesAlert, dollars } from "../../../lib/ai-usage";
import { runQuery } from "../../../lib/ai-answer";
import { aiGate, aiCanEdit } from "../../../lib/ai-authz";
import { PROJECT_ACTIONS, actionAllowed, reasonFromText } from "../../../lib/ai-project-actions";
import { sendProposalAction, requestSignatureEmailAction, recordPaymentAction, captureFeedbackAction, saveProposalDraftAction, addNoteAction, requestPaymentReminderAction } from "./proposal-actions";
import { setStage, addAssignmentAction, installIssueAction, reportInstallIssueAction } from "./actions";
import { stagesForType } from "../../../lib/spec";

// Open install-issue flags (NEEDS_REVIEW | NEEDS_REWORK) — the only ones adjudicate_issue can close.
const OPEN_ISSUE = new Set(["NEEDS_REVIEW", "NEEDS_REWORK"]);
function openInstallIssuesFor(accessId) {
  try { return (listInstallIssues(accessId) || []).filter((i) => OPEN_ISSUE.has(String(i.status || "").toUpperCase())); }
  catch { return []; }
}
// Is this caller scoped to THIS project? Mirrors issueTok/techOnProject (actions.js): a PIN caller is bound
// to the PIN's accessId; a logged-in technician must be on the roster, the work-order crew, or the signing
// tech. Used to stop a tech's ACTION PREVIEW from reading a project they aren't assigned to (the write path
// re-enforces this independently via issueTok). Synchronous (all reads are sync db calls).
function tokScopedToProject(accessId, tok) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  const roster = getProjectAssignments(accessId) || [];
  if (roster.some((a) => a.role === "tech" && ((tok.id != null && Number(a.user_id) === Number(tok.id)) || (tok.email && norm(a.user_email) === norm(tok.email))))) return true;
  try { const crew = JSON.parse(getToolData(accessId, "techs")?.data || "{}").names || []; if (crew.some((n) => norm(n) === norm(tok.name))) return true; } catch { /* no crew */ }
  const prop = getActiveProposal(accessId);
  return !!(prop?.tech_signed_name && norm(prop.tech_signed_name) === norm(tok.name));
}

// Find a proposal line by its own id, or by the survey camera's stable cid (camera_id — the camera↔line
// bridge). Used by propose_change to map a resolved device to the exact line.
function findProposalLine(payload, { cid, id } = {}) {
  // Scope to the FIRST option — applyIntentToPayload's edit_item resolves against options[0], so a line we
  // could only find in option[1] would be uneditable; keep the mapper and the editor in the same scope.
  const opt = (payload?.options || [])[0];
  if (!opt) return null;
  for (const s of (opt.services || [])) for (const it of (s.items || [])) {
    if (id != null && it.id === id) return it;
    if (cid && it.camera_id === cid) return it;
  }
  return null;
}

// 8c — confirm copy when a proposal change targets a SENT/SIGNED row: it becomes a revision (v+1) that
// supersedes the current version, with the explicit re-sign (signed) / re-send (sent) consequence spelled out.
function reviseConfirm(nm, row, change) {
  const signed = !!row.signed_name, v = +row.version || 1;
  return {
    title: `Revise ${nm}'s proposal — ${change}`,
    detail: signed
      ? `Creates v${v + 1} and supersedes the SIGNED v${v} — this voids the signature and the customer must re-sign.`
      : `Creates v${v + 1} and supersedes sent v${v} — you'll re-send it.`,
  };
}

// A short human reference for an issue in a confirm/clarify line (never a raw id alone).
function issueLabel(i) {
  const where = i?.target_kind === "order" ? "work order" : (i?.target_label || "line item");
  return i?.reason ? `${where} — ${i.reason}` : where;
}

// The project's TYPE-AWARE stage order (a Type C project skips some stages) — so an action's "next stage"
// matches what setStage will accept. Null when the type is unknown; the action then reports "final stage".
function stageOrderFor(job) { try { return (stagesForType(job?.project_type) || []).map((s) => s.key); } catch { return null; } }
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

// Router first (0 tokens); only unrouted text hits a model. Returns { intent, noKey?, capped? }.
// Model routing (owner): a strong model (Sonnet) for the heavy asks, a fast one (Haiku) otherwise — chosen
// 0-token by pickModel. Cost control: every model call is costed + recorded (recordAiUsage); once the day's
// spend hits the cap the model is skipped (router-only) so Maya degrades gracefully instead of overspending;
// an alert fires to admin/manager the one call that crosses the warn threshold.
async function interpret(text, context, meta = {}) {
  const routed = routeCommand(text);
  if (routed) return { intent: routed };
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return { intent: { type: "unknown" }, noKey: true };
  const spentBefore = aiSpendTodayCents();
  const cap = aiSpendCapCents();
  if (cap > 0 && spentBefore >= cap) return { intent: { type: "unknown" }, capped: true };
  const model = pickModel(text);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(buildClaudeBody(text, context, { model })),
    });
    if (!res.ok) return { intent: { type: "unknown" }, model };
    const json = await res.json();
    const inTok = +json?.usage?.input_tokens || 0, outTok = +json?.usage?.output_tokens || 0;
    const cost = costCents(model, inTok, outTok);
    recordAiUsage({ model, inTok, outTok, costCents: cost, role: meta.role || null, accessId: meta.accessId || context?.currentAccessId || null, kind: meta.kind || "interpret" });
    if (crossesAlert(spentBefore, cost, cap, aiSpendAlertPct())) {
      try { notifyRoles(["admin", "manager"], { type: "ai_cost", title: "Maya AI spend alert", body: `Today's AI spend passed ${aiSpendAlertPct()}% of the ${dollars(cap)} cap.` }); } catch {}
    }
    return { intent: parseClaudeResult(json), model };
  } catch { return { intent: { type: "unknown" }, model }; }
}

// Run a read-only "answer" intent: retrieve real data (authorized, via existing db functions) and return
// the answer TEXT — never invented. Ambiguous → a clarify question; permission/no-data/error carry a
// `reason` for the (future) training loop. Shared by the proposal bar and the global ⌘K bar.
function answerFor(intent, tok, currentAccessId, opts = {}) {
  const ctx = {
    role: tok.role, userId: tok.id, userName: actorName(tok), currentAccessId: currentAccessId || null, can,
    // ownedAccessId: a project whose ownership the CALLER already proved (customer path) — resolveProject
    // trusts it for that one project, so a customer on a RESTRICTED project still reads their own data
    // instead of being filtered out by getVisibleJobs (which isn't a per-customer filter). Staff omit it.
    ownedAccessId: opts.ownedAccessId || null,
    db: { getActiveProposal, getJobByAccessId, getReceivables, getVisibleJobs, searchProjects,
          buildStageFacts, getProjectAssignments, getProjectFinancialState, listInstallIssues, getProjectDevices, listFeedback, getProjectEvents },
    fin: { optionTotals },
  };
  const r = runQuery(intent, ctx);
  if (r.error) {
    const kind = r.reason === "ambiguous" ? "clarify" : r.reason === "permission" ? "unsupported" : r.reason === "no_data" ? "answer" : "unanswered";
    return { ok: true, kind, speak: r.error, reason: r.reason };
  }
  // Carry the resolved project back so the client's memory can track it — a later "it"/"that customer"
  // then resolves even though no navigation happened. `device` (when a read resolved one) lets the client
  // highlight it on the planner/layout.
  return { ok: true, kind: "answer", speak: r.text, facts: r.facts || [], project: r.project || null, device: r.device || null };
}

// Preview a Phase-2 project ACTION: editor-only, and AVAILABLE given the project's CURRENT state (so we show
// "can't yet, because…" instead of letting the real action fail). Returns a confirmable write — the mutation
// runs only on explicit human apply, through the existing self-authorizing server action.
function previewAction(name, accessId, tok, args) {
  const spec = PROJECT_ACTIONS[name];
  if (!spec) return { ok: true, kind: "unsupported", speak: "I can't do that action yet.", reason: "unsupported_action" };
  // Editor role AND the action's specific capability (sending ≠ paying ≠ moving a stage).
  if (!actionAllowed(name, { editor: aiCanEdit(tok.role), can: (c) => can(tok.role, c) }))
    return { ok: true, kind: "unsupported", speak: "Your role can't do that action.", reason: "permission" };
  if (!accessId) return { ok: true, kind: "unsupported", speak: "Open a project first." };
  // A TECHNICIAN is scoped to the jobs they're on — mirror issueTok so the preview (which reads project
  // data like the device layout) can't disclose a project a tech isn't assigned to. Editors see all projects.
  if (tok.role === "tech" && !tokScopedToProject(accessId, tok))
    return { ok: true, kind: "unsupported", speak: "That isn't a project you're assigned to.", reason: "permission" };
  // Parameterized actions need valid args before we can preview a confirmable card.
  if (name === "record_payment" && !(args && +args.amount > 0)) return { ok: true, kind: "clarify", speak: "How much should I record? Say the amount." };
  let eff = args, previewDevice = null;   // previewDevice → client highlights it on the planner (floor-plan highlight)
  if (name === "assign_tech") {
    // Tolerant resolve (exact → prefix → first name): clarify if none, disambiguate if several.
    const r = resolveTechByName(args?.techName || "");
    if (r.candidates) return { ok: true, kind: "clarify", speak: `Which one — ${r.candidates.map((c) => c.name).join(", ")}?` };
    if (!r.user) return { ok: true, kind: "clarify", speak: `I couldn't find a technician named "${args?.techName || "that"}". Who should I assign?` };
    eff = { ...args, resolvedName: r.user.name, userId: r.user.id };
  }
  // adjudicate_issue binds to ONE open flag: use the named id, else the sole open one, else clarify the list.
  const openIssues = name === "adjudicate_issue" ? openInstallIssuesFor(accessId) : undefined;
  if (name === "adjudicate_issue") {
    if (!openIssues.length) return { ok: true, kind: "unsupported", speak: "There are no open issues to close.", reason: "not_available" };
    let target;
    if (args?.issueId != null) {
      target = openIssues.find((i) => Number(i.id) === Number(args.issueId));
      if (!target) return { ok: true, kind: "clarify", speak: `Issue #${args.issueId} isn't open. Open: ${openIssues.map((i) => `#${i.id} ${issueLabel(i)}`).join(", ")}.` };
    } else if (openIssues.length === 1) {
      target = openIssues[0];
    } else {
      return { ok: true, kind: "clarify", speak: `Which issue — ${openIssues.map((i) => `#${i.id} (${issueLabel(i)})`).join(", ")}?` };
    }
    eff = { decision: args?.decision === "dismiss" ? "dismiss" : "resolve", issueId: target.id, label: issueLabel(target) };
  }
  // raise_issue resolves the natural device reference to ONE stable device id (via the reusable resolver over
  // the survey model). Ambiguous → clarify with the options; unknown → clarify; never guess.
  if (name === "raise_issue") {
    const devices = getProjectDevices(accessId);
    if (!devices.length) return { ok: true, kind: "clarify", speak: "This project has no placed survey devices yet, so there's nothing to flag. Add devices in the Site Survey first." };
    const r = resolveDevice(args?.ref || "", devices);
    if (r.candidates) return { ok: true, kind: "clarify", speak: `Which one — ${r.candidates.map((c) => c.display).join(", ")}?` };
    if (!r.device) return { ok: true, kind: "clarify", speak: `I couldn't tell which device you mean. Try its number or location — e.g. "camera 3" or "the front entrance camera".` };
    eff = { deviceId: r.device.id, deviceLabel: candidateView(r.device).display, reason: args?.reason || "Other", note: args?.note || "" };
    previewDevice = { id: r.device.id, cid: r.device.cid || null, floor: r.device.floor, code: r.device.code, label: r.device.label, accessId };
  }
  // capture_feedback optionally BINDS a device (owner's headline: "not sure we need that entrance camera" →
  // concern recorded against that camera). Ambiguous device → clarify; unknown/none → still capture, unbound
  // (feedback is never lost just because the device couldn't be pinned).
  if (name === "capture_feedback") {
    eff = { kind: args?.kind || "feedback:other", body: args?.body || args?.ref || "" };
    if (args?.wantsDevice) {
      const r = resolveDevice(args?.ref || "", getProjectDevices(accessId));
      if (r.candidates) return { ok: true, kind: "clarify", speak: `Which device is that about — ${r.candidates.map((c) => c.display).join(", ")}?` };
      if (r.device) { eff.deviceId = r.device.id; eff.deviceLabel = candidateView(r.device).display; previewDevice = { id: r.device.id, cid: r.device.cid || null, floor: r.device.floor, code: r.device.code, label: r.device.label, accessId }; }
    }
  }
  // request_payment (#1 collections): email the customer a deposit/balance reminder — ONLY when something is
  // due (reads the canonical financial state for the real amount/kind). Preview → human confirm → the guarded
  // requestPaymentReminderAction (admin/manager, re-checks + debounces). Never charges.
  if (name === "request_payment") {
    const fin = getProjectFinancialState(accessId);
    const due = Math.round((+fin?.amountDueNow || 0) * 100) / 100;
    if (!(due > 0)) return { ok: true, kind: "clarify", speak: "Nothing is due on this project right now — no reminder to send." };
    const kind = fin.financialState === "awaiting_deposit" ? "deposit" : "balance";
    const amount = "$" + due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const prev = PROJECT_ACTIONS.request_payment.confirm(actionContext(getJobByAccessId(accessId), accessId), { kind, amount });
    return { ok: true, kind: "write", write: "action", intent: { type: "action", name, accessId, args: { kind, amount } }, preview: { title: prev.title, body: prev.detail } };
  }
  // propose_change (#2, 8a): a DEVICE-REFERENCED change to a DRAFT proposal line. Resolves the device, maps it
  // to the line via camera_id===cid, applies the edit to a CLONE for the before/after preview, and returns a
  // confirmable write — nothing persists until apply. Draft-only; a sent/signed proposal defers to 8c.
  if (name === "propose_change") {
    const row = getActiveProposal(accessId);
    if (!row || !row.payload) return { ok: true, kind: "unsupported", speak: "There's no proposal to change yet.", reason: "not_available" };
    // Draft → edit in place; sent/signed → a revision (v+1), which requires proposal.revise (admin/manager).
    const revise = row.status !== "draft";
    if (revise && !can(tok.role, "proposal.revise")) return { ok: true, kind: "unsupported", speak: "Revising a sent or signed proposal is limited to admin and managers.", reason: "permission" };
    let payload; try { payload = JSON.parse(row.payload); } catch { return { error: "Couldn't read the proposal." }; }
    const r = resolveDevice(args?.ref || "", getProjectDevices(accessId));
    if (r.candidates) return { ok: true, kind: "clarify", speak: `Which device — ${r.candidates.map((c) => c.display).join(", ")}?` };
    const dev = r.device || null;
    const line = dev && dev.cid ? findProposalLine(payload, { cid: dev.cid }) : null;
    if (!line) return { ok: true, kind: "clarify", speak: dev ? `${candidateView(dev).display} isn't a line on this proposal yet — add it first, or edit the proposal directly.` : `I couldn't tell which proposal line you mean — name the camera, e.g. "camera 3".` };
    // A camera line is a zero-price GROUP HEADER whose hardware/labor live in sub[]; changing the header qty
    // does NOT scale the camera (it would silently no-op). So a QTY change on a camera block is refused with
    // guidance; a model SWAP renames the header (annotation), appended to keep the existing location label.
    const isCameraBlock = !!line.camera_id || (Array.isArray(line.sub) && line.sub.length > 0);
    const curQty = +line.qty || 0, curName = line.name || "";
    let set, change;
    if (args?.set?.qty != null) {
      if (isCameraBlock) return { ok: true, kind: "clarify", speak: `A camera is quoted as one block per location, so I can't just change its quantity. To add another, say "add a camera"; I can also switch this one's model or remove it.` };
      set = { qty: Math.max(1, Math.min(999, parseInt(args.set.qty, 10) || 1)) };
      change = `qty ${curQty} → ${set.qty}`;
    } else if (args?.set?.name != null) {
      const spec = String(args.set.name).slice(0, 48).trim();
      const finalName = (curName ? `${curName} — ${spec}` : spec).slice(0, 80);   // append the spec; keep the location label
      set = { name: finalName };
      change = `"${curName || "the line"}" → "${finalName}" (price unchanged — set it in the proposal)`;
    } else {
      return { ok: true, kind: "clarify", speak: `Tell me what to change — a quantity or a model.` };
    }
    const applied = applyIntentToPayload(payload, { type: "edit_item", match: { id: line.id }, set });
    if (applied.error) return { ok: true, kind: "clarify", speak: applied.error };
    const before = grandOf(payload, row), after = grandOf(applied.payload, row);
    const nm = actionContext(getJobByAccessId(accessId), accessId).name;
    const prev = revise ? reviseConfirm(nm, row, change) : PROJECT_ACTIONS.propose_change.confirm({ name: nm }, { lineLabel: curName, change });
    const device = dev ? { id: dev.id, cid: dev.cid || null, floor: dev.floor, code: dev.code, label: dev.label, accessId } : null;
    return { ok: true, kind: "write", write: "action",
      intent: { type: "action", name, accessId, args: { lineId: line.id, set, lineLabel: curName, change } },
      preview: { title: prev.title, body: prev.detail, ...(before !== after ? { before, after } : {}) },
      ...(device ? { device } : {}) };
  }
  // remove_line (#2, 8b): propose REMOVING a device's line from a DRAFT proposal. Resolves the device → line,
  // applies remove to a CLONE for the total drop, returns a confirmable write. proposal.revise-gated (checked
  // above via actionAllowed). Draft-only; a sent/signed proposal defers to 8c.
  if (name === "remove_line") {
    const row = getActiveProposal(accessId);
    if (!row || !row.payload) return { ok: true, kind: "unsupported", speak: "There's no proposal to change yet.", reason: "not_available" };
    const revise = row.status !== "draft";
    if (revise && !can(tok.role, "proposal.revise")) return { ok: true, kind: "unsupported", speak: "Revising a sent or signed proposal is limited to admin and managers.", reason: "permission" };
    let payload; try { payload = JSON.parse(row.payload); } catch { return { error: "Couldn't read the proposal." }; }
    const r = resolveDevice(args?.ref || "", getProjectDevices(accessId));
    if (r.candidates) return { ok: true, kind: "clarify", speak: `Which device — ${r.candidates.map((c) => c.display).join(", ")}?` };
    const dev = r.device || null;
    const line = dev && dev.cid ? findProposalLine(payload, { cid: dev.cid }) : null;
    if (!line) return { ok: true, kind: "clarify", speak: dev ? `${candidateView(dev).display} isn't a line on this proposal, so there's nothing to remove.` : `I couldn't tell which line to remove — name the camera, e.g. "camera 3".` };
    const curName = line.name || "the line";
    const applied = applyIntentToPayload(payload, { type: "remove_item", match: { id: line.id } });
    if (applied.error) return { ok: true, kind: "clarify", speak: applied.error };
    const before = grandOf(payload, row), after = grandOf(applied.payload, row);
    const nm = actionContext(getJobByAccessId(accessId), accessId).name;
    const prev = revise ? reviseConfirm(nm, row, `remove ${curName}`) : PROJECT_ACTIONS.remove_line.confirm({ name: nm }, { lineLabel: curName });
    const device = dev ? { id: dev.id, cid: dev.cid || null, floor: dev.floor, code: dev.code, label: dev.label, accessId } : null;
    return { ok: true, kind: "write", write: "action",
      intent: { type: "action", name, accessId, args: { lineId: line.id, lineLabel: curName } },
      preview: { title: prev.title, body: prev.detail, ...(before !== after ? { before, after } : {}) },
      ...(device ? { device } : {}) };
  }
  const facts = buildStageFacts(accessId);
  if (!facts) return { error: "Couldn't read this project." };
  const job = getJobByAccessId(accessId);
  const avail = spec.available ? spec.available(facts, getProjectAssignments(accessId), { order: stageOrderFor(job), openIssues }) : { ok: true };
  if (!avail.ok) return { ok: true, kind: "unsupported", speak: `I can't do that yet — ${avail.why}.`, reason: "not_available" };
  // Show WHO it goes to / which tech (+ any action-specific data, e.g. the target stage) before confirming.
  const prev = spec.confirm({ ...actionContext(job, accessId), ...(avail.data || {}) }, eff);
  // intent.accessId BINDS the confirm to this exact project; intent.args binds the exact amount — apply
  // dispatches against both, never "whatever project is open now" or a different amount.
  return { ok: true, kind: "write", write: "action", intent: { type: "action", name, accessId, ...(eff ? { args: eff } : {}) }, preview: { title: prev.title, body: prev.detail }, ...(previewDevice ? { device: previewDevice } : {}) };
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
export async function aiApplyProjectActionAction(accessId, name, args) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  const spec = PROJECT_ACTIONS[name];
  if (!spec) return { error: "Unknown action." };
  if (!actionAllowed(name, { editor: aiCanEdit(g.tok.role), can: (c) => can(g.tok.role, c) }))
    return { error: "Your role can't do that action." };
  const job = getJobByAccessId(accessId);
  if (!accessId || !job) return { error: "Couldn't find that project." };
  const facts = buildStageFacts(accessId);
  if (!facts) return { error: "Couldn't read this project." };
  // Re-check availability against CURRENT state + assignments + the TYPE-AWARE stage order + open issues
  // (never trust the stale client intent); the action-specific data (e.g. the target stage) is recomputed here.
  const openIssues = name === "adjudicate_issue" ? openInstallIssuesFor(accessId) : undefined;
  const avail = spec.available ? spec.available(facts, getProjectAssignments(accessId), { order: stageOrderFor(job), openIssues }) : { ok: true };
  if (!avail.ok) return { error: `Can't do that — ${avail.why}.` };
  // Re-validate args server-side (never trust the client amount). recordPaymentAction clamps + re-checks too.
  const amount = Math.round((+args?.amount || 0) * 100) / 100;
  if (name === "record_payment" && !(amount > 0)) return { error: "Enter an amount." };

  let out, message, noop = false;
  if (name === "send_proposal") { out = await sendProposalAction(accessId); message = "Proposal sent."; }
  else if (name === "request_signature") { out = await requestSignatureEmailAction(accessId); noop = out?.sent === false; message = noop ? (out.note || "Already handled.") : "Signature reminder sent."; }
  else if (name === "advance_stage") { out = await setStage(accessId, g.tok.role, avail.data.nextStage); message = `Moved to ${avail.data.nextLabel}.`; }
  else if (name === "record_payment") { out = await recordPaymentAction(accessId, { amount, kind: args?.kind || "partial" }); message = `Recorded $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`; }
  else if (name === "assign_tech") {
    const r = resolveTechByName(args?.techName || "");   // RE-resolve fresh — never trust a client-supplied userId
    if (!r.user) return { error: r.candidates ? "Name the exact technician — more than one matched." : "I couldn't find that technician." };
    const u = r.user;
    out = await addAssignmentAction(accessId, { userId: u.id, userName: u.name, userEmail: u.email, role: "tech" });
    // The certification gate is the business's, not the AI's — refuse with the reason, never auto-override.
    if (out?.gate) return { error: `${out.techName || u.name} isn't certified for this service${out.missing?.length ? ` (missing: ${out.missing.join(", ")})` : ""}. An admin can assign them manually.` };
    message = out?.existed ? `${u.name} is already assigned.` : `Assigned ${u.name}.`;
  }
  else if (name === "adjudicate_issue") {
    // Re-bind the target against the issues OPEN right now (never trust the client id) — if it closed
    // between preview and apply, refuse rather than act on a stale reference.
    const id = Number(args?.issueId);
    const target = (openIssues || []).find((i) => Number(i.id) === id);
    if (!target) return { error: "That issue is no longer open." };
    const decision = args?.decision === "dismiss" ? "dismiss" : "resolve";
    out = await installIssueAction(accessId, id, decision);   // self-authorizes (issue.adjudicate) + re-checks status
    message = decision === "dismiss" ? "Issue dismissed." : "Issue resolved.";
  }
  else if (name === "raise_issue") {
    // RE-resolve the device against the CURRENT survey (never trust the client device id) — if it moved or
    // was removed since preview, refuse rather than flag a phantom.
    const dev = getProjectDevices(accessId).find((d) => String(d.id) === String(args?.deviceId));
    if (!dev) return { error: "That device is no longer in the survey — reopen the survey and try again." };
    const label = candidateView(dev).display;
    // Re-derive the reason server-side from the human's words (don't trust a client-sent label).
    const reason = reasonFromText(args?.note || "");
    // Duplicate guard: if this device already has an OPEN flag for the same reason, don't create a second.
    const dup = (openInstallIssues(accessId) || []).find((i) => i.target_kind === "device" && String(i.target_id) === String(dev.id) && String(i.reason || "") === reason);
    if (dup) { out = { ok: true }; noop = true; message = `${label} already has an open ${reason} flag.`; }
    else {
      out = await reportInstallIssueAction(accessId, { targetKind: "device", targetId: dev.id, targetLabel: label, reason, note: args?.note || "" });
      message = out?.error ? null : `Flagged ${label}${reason !== "Other" ? ` — ${reason}` : ""}.`;
    }
  }
  else if (name === "capture_feedback") {
    // Re-bind the device server-side if one was referenced (never trust a client device id); drop it if it's
    // gone rather than failing — the feedback still gets captured.
    let deviceId = null, deviceLabel = null;
    if (args?.deviceId != null) {
      const dev = getProjectDevices(accessId).find((d) => String(d.id) === String(args.deviceId));
      if (dev) { deviceId = dev.id; deviceLabel = candidateView(dev).display; }
    }
    out = await captureFeedbackAction(accessId, { body: args?.body || "", kind: args?.kind || "feedback:other", deviceId, deviceLabel });
    message = out?.error ? null : `Logged ${deviceLabel ? `feedback on ${deviceLabel}` : "the feedback"} for review.`;
  }
  else if (name === "request_payment") {
    out = await requestPaymentReminderAction(accessId);
    noop = out?.sent === false;
    message = out?.error ? null : (noop ? (out?.note || "Nothing to send.") : `Payment reminder sent${out?.amount ? ` (${"$" + (+out.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ""}.`);
  }
  else if (name === "propose_change" || name === "remove_line") {
    // Re-derive everything server-side (never trust the client payload). DRAFT → edit in place; SENT/SIGNED →
    // mint a revision (v+1) first (proposal.revise, admin/manager) then apply to it. The change is validated
    // on the current payload BEFORE minting, so a bad edit never leaves a stray empty revision.
    let row = getActiveProposal(accessId);
    if (!row || !row.payload) return { error: "There's no proposal to change." };
    const revise = row.status !== "draft";
    if (revise && !can(g.tok.role, "proposal.revise")) return { error: "Revising a sent or signed proposal is limited to admin and managers." };
    let payload; try { payload = JSON.parse(row.payload); } catch { return { error: "Couldn't read the proposal." }; }
    const tgt = findProposalLine(payload, { id: args?.lineId });
    if (!tgt) return { error: "That proposal line is no longer there." };
    let intent;
    if (name === "remove_line") intent = { type: "remove_item", match: { id: args.lineId } };
    else {
      // Whitelist to qty/name ONLY — a change from conversation can NEVER move price (structural, not trust).
      const set = {};
      if (args?.set?.qty != null) { if (tgt.camera_id || (Array.isArray(tgt.sub) && tgt.sub.length)) return { error: "A camera is quoted as a block — add or remove a camera instead of changing its quantity." }; set.qty = Math.max(1, Math.min(999, parseInt(args.set.qty, 10) || 1)); }
      if (args?.set?.name != null) set.name = String(args.set.name).slice(0, 80);
      if (!Object.keys(set).length) return { error: "Nothing to change." };
      intent = { type: "edit_item", match: { id: args.lineId }, set };
    }
    const check = applyIntentToPayload(payload, intent);   // validate BEFORE minting a revision
    if (check.error) return { error: check.error };
    let wasSigned = false, newVer = row.version;
    if (revise) {
      const rv = reviseProposal(accessId, actorName(g.tok));
      if (!rv.proposal) return { error: "Couldn't start a revision." };
      wasSigned = !!rv.wasSigned; row = rv.proposal; newVer = row.version;
      try { payload = JSON.parse(row.payload); } catch { return { error: "Couldn't read the revision." }; }
      if (!findProposalLine(payload, { id: args.lineId })) return { error: "That line isn't in the revision." };
    }
    const applied = applyIntentToPayload(payload, intent);
    if (applied.error) return { error: applied.error };
    out = await saveProposalDraftAction(accessId, { payload: applied.payload, taxRate: row.tax_rate, depositPct: row.deposit_pct });
    const verb = name === "remove_line" ? `removed ${args?.lineLabel || "the line"}` : `updated ${args?.lineLabel || "the line"}`;
    message = out?.error ? null : (revise
      ? `Revised to v${newVer} — ${verb}. ${wasSigned ? "The customer must re-sign." : "Re-send when ready."}`
      : (name === "remove_line" ? `Removed ${args?.lineLabel || "the line"} from the proposal.` : `Updated the proposal${args?.lineLabel ? ` (${args.lineLabel})` : ""}.`));
  }
  else return { error: "That action isn't wired yet." };
  if (out?.error) return { error: out.error };

  // Audit only when something actually happened — a no-op (already signed / debounced) isn't an "email sent".
  if (!noop) logProjectEvent(accessId, { kind: "ai", label: `AI: ${name} — by ${actorName(g.tok)}`, actor: actorName(g.tok) });
  try { const { revalidatePath } = await import("next/cache"); revalidatePath(`/project/${accessId}`); } catch {}
  return { ok: true, message };
}

// Classify a result we couldn't turn into an action/answer, so the response is useful AND the future
// self-improvement system has a signal. A QUESTION we couldn't retrieve → "unanswered" (company knowledge,
// Phase 2); anything else → "unknown". Never a bare "I don't know" when we can say what we CAN do.
const CAPS_LINE = "I can look up a proposal total, a project's status, which proposals are unsigned, or what's in QC — or edit a proposal and open a project.";

// Phase 3.1 — answer from the APPROVED support library (admin/manager-authored; never invented) before we
// fall back to "I don't have that." Audience-scoped: staff may read both libraries; a customer (Phase 6) gets
// only "customer". A match must clear findKnowledge's relevance bar, or this returns null (→ classifyMiss).
function knowledgeAnswer(text, tok) {
  const audiences = tok?.role === "customer" ? ["customer"] : ["customer", "tech"];
  const articles = [];
  for (const aud of audiences) {
    try { for (const a of (getSupportArticles(aud) || [])) articles.push({ ...a, audience: aud }); } catch { /* library unavailable → skip */ }
  }
  const hit = findKnowledge(text, { articles });
  if (!hit) return null;
  const href = hit.audience === "tech" ? "/tech-support" : "/support";
  return {
    ok: true, kind: "answer", source: "knowledge",
    speak: `From the Help Center — "${hit.title}": ${hit.snippet}`,
    link: { href, label: hit.audience === "tech" ? "Tech Support" : "Help Center" },
  };
}

function classifyMiss(text, noKey, capped) {
  // The daily AI spend cap is hit → the model is paused; the 0-token router still works, so say so honestly.
  if (capped) return { ok: true, kind: "unsupported", reason: "spend_cap", speak: "I've reached today's AI usage limit, so I can only handle the quick commands right now. It resets tonight — or an admin can raise the cap in Admin ▸ Maya." };
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

  const { intent, noKey, capped } = await interpret(t, context, { role: g.tok.role, accessId });

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
    // A note is routine + additive → apply instantly (no Undo needed; it's low-stakes and audited).
    return { ok: true, kind: "write", write: "note", intent, preview: { title: "Add project note", body: intent.body }, instant: true, noUndo: true };
  }

  if (["add_items", "set_discount", "edit_item", "set_desc", "reorder_section"].includes(intent.type)) {
    return proposalPreview(accessId, intent);
  }

  if (intent.type === "action") return previewAction(intent.name, accessId, g.tok, intent.args);

  if (intent.type === "answer") return answerFor(intent, g.tok, accessId || context.memory?.project?.accessId);
  if (intent.type === "clarify") return { ok: true, kind: "clarify", speak: intent.ask };
  if (intent.type === "unsupported") return { ok: true, kind: "unsupported", speak: intent.reason || CAPS_LINE, reason: "unsupported_action" };
  return knowledgeAnswer(t, g.tok) || classifyMiss(t, noKey, capped);
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
  // Confirmation policy (owner): routine edits apply INSTANTLY with an Undo; only the unusual/irreversible
  // confirm. A LARGE discount (≥20%) is the one proposal edit that still asks first; everything else is
  // instant (reversible via Undo — the builder's prior payload is restored). Sends / payments / stage
  // moves / removals are `action` writes and always confirm (previewAction, never instant).
  const bigDiscount = intent.type === "set_discount" && (+intent.pct >= 20);
  return { ok: true, kind: "write", write: "proposal", intent, preview, instant: !bigDiscount };
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
  // Writing an audit line is a WRITE — editors only (a tech in the assistant is read-only), and a tech is
  // additionally scoped to their own jobs. Without this, a tech could pollute any project's Job Log with
  // attacker-controlled free text. (aiCanEdit already excludes tech; the scope check is defense-in-depth.)
  if (!aiCanEdit(g.tok.role)) return { error: "Your role can't do that." };
  if (g.tok.role === "tech" && !tokScopedToProject(accessId, g.tok)) return { error: "That isn't a project you're assigned to." };
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

  const { intent, noKey, capped } = await interpret(t, context, { role: g.tok.role, accessId: context.currentAccessId || null, kind: "global" });
  // A question → retrieve + answer directly (don't navigate). This is what makes it an assistant, not a bar.
  // With no page project, the last project the assistant resolved (memory) is the referent for "it"/"that".
  if (intent.type === "answer") return answerFor(intent, g.tok, context.currentAccessId || context.memory?.project?.accessId);
  if (intent.type === "clarify") return { ok: true, kind: "clarify", speak: intent.ask };
  if (intent.type === "action") {
    const acc = context.currentAccessId || context.memory?.project?.accessId;
    if (!acc) return { ok: true, kind: "unsupported", speak: "Open a project first, then I can do that." };
    return previewAction(intent.name, acc, g.tok, intent.args);
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
  return knowledgeAnswer(t, g.tok) || classifyMiss(t, noKey, capped);
}

// Apply an add_note command.
export async function aiApplyNoteAction(accessId, body) {
  const g = await authorize();
  if (!g.ok) return { error: g.error };
  // add_note is a WRITE_INTENTS member — editors only, and a tech is scoped to their own jobs. This exported
  // RPC is directly callable, so it must re-enforce the same gate the interpret path applies (ai-actions.js
  // WRITE_INTENTS check), not rely on the client having gone through it.
  if (!aiCanEdit(g.tok.role)) return { error: "Editing is limited to sales and managers." };
  if (g.tok.role === "tech" && !tokScopedToProject(accessId, g.tok)) return { error: "That isn't a project you're assigned to." };
  const text = String(body || "").trim();
  if (text.length < 2) return { error: "The note is empty." };
  addProjectNote(accessId, { role: g.tok.role, name: actorName(g.tok), body: text, scope: "general", isPublic: false });
  logProjectEvent(accessId, { kind: "ai", label: `AI: note added — by ${actorName(g.tok)}`, actor: actorName(g.tok) });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

// ---- #3 Phase 6: CUSTOMER-facing assistant (read-only slice) --------------------------------------------
// A SEPARATE entry from the staff bar — a customer never reaches aiGate/the staff assistant. Gated behind its
// OWN flag (AI_CUSTOMER), restricted to role="customer" who owns THIS project, and answers ONLY an allowlisted
// read on their own project (role="customer" → the answer layer strips cost/payout/internal) or the approved
// customer FAQ. Customer text is UNTRUSTED: deterministic router only (no model fallback), and NO writes.
// Customer-facing writes (accept / sign / pay / comment) are a later slice, gated separately.
const customerAiOn = () => secretValue("AI_CUSTOMER") === "on";
export async function aiCustomerStatusAction(accessId) {
  const tok = await getSessionRole();
  const owns = !!tok && tok.role === "customer" && ((tok.viaPin && String(tok.accessId) === String(accessId)) || customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email }));
  return { enabled: !!(owns && customerAiOn()) };
}
export async function aiCustomerInterpretAction(accessId, text) {
  const tok = await getSessionRole();
  if (!tok || tok.role !== "customer") return { error: "Unavailable." };
  if (!customerAiOn()) return { error: "Unavailable." };
  // Own-project gate: a PIN customer is bound to the PIN's accessId; a logged-in customer must own this project.
  const owns = (tok.viaPin && String(tok.accessId) === String(accessId)) || customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email });
  if (!owns) return { error: "Unavailable." };
  // Cap untrusted customer input before it hits the regex router / FAQ scorer (DoS/ReDoS safety).
  const t = String(text || "").trim().slice(0, 600);
  if (!t) return { ok: true, kind: "answer", speak: "Ask me about your project — its status, your quote, your balance, or what your cameras cover." };

  // 1) An ALLOWLISTED read, FORCED to the customer's own project, run as the customer (sanitize/caps apply).
  //    ownedAccessId lets resolveProject return their own project even if it's restricted (ownership proven above).
  const read = customerReadIntent(t);
  if (read) return answerFor({ type: "answer", query: read.query, target: "this", ...(read.ref ? { ref: read.ref } : {}) }, tok, accessId, { ownedAccessId: accessId });

  // 2) A customer WRITE/ACTION (slice 3): a comment to relay (confirmed write), or a deliberate act
  //    (sign/accept/pay) → GUIDED NAVIGATION to their proposal section (the AI never signs/pays).
  const act = customerActionIntent(t);
  if (act?.kind === "comment") {
    return { ok: true, kind: "write", write: "comment", body: act.body,
      preview: { title: "Send this to your project team?", body: act.body } };
  }
  // #7 headline — an objection/change-request. If they named a device, EXPLAIN its coverage from the survey
  // first (so they get the "here's what it's for" answer), then offer to record the concern against that exact
  // device. The write is confirmed (Send/Cancel) and goes through aiCustomerFeedbackAction (re-gated there).
  if (act?.kind === "objection") {
    let deviceId = null, deviceLabel = null, coverage = "";
    const devices = getProjectDevices(accessId) || [];
    if (devices.length) {
      const hit = resolveDevice(act.ref || "", devices);
      if (hit.device) {
        deviceId = hit.device.id; deviceLabel = candidateView(hit.device).display;
        coverage = describeCoverage(hit.device);
      }
    }
    const lead = coverage ? `${coverage} ` : "";
    // Only deviceId travels to the apply action — the label is recomputed server-side from the re-resolved
    // device (the client value is never trusted). deviceLabel here is for the confirm wording only.
    return { ok: true, kind: "write", write: "objection", body: act.body, feedbackKind: act.feedbackKind, deviceId, deviceLabel,
      speak: `${lead}Want me to share this concern${deviceLabel ? ` about ${deviceLabel}` : ""} with your project team?`,
      preview: { title: `Share this concern${deviceLabel ? ` about ${deviceLabel}` : ""} with your team?`, body: act.body } };
  }
  if (act?.kind === "nav") {
    return { ok: true, kind: "navigate", href: `/project/${accessId}?stage=proposal`, label: act.label,
      speak: `I'll take you to ${act.label}.` };
  }

  // 3) Approved customer FAQ (admin-authored; never invented). knowledgeAnswer scopes a customer to the
  //    "customer" library only.
  const k = knowledgeAnswer(t, tok);
  if (k) return k;

  // 4) Safe fallback — no staff capabilities, no writes, nothing invented.
  return { ok: true, kind: "answer", speak: "I can tell you your project's status, your quote total and balance, and what your cameras cover — and answer common questions. What would you like to know?" };
}

// Apply a customer's COMMENT (the one customer-facing write). The Send/Cancel confirm in the UI is UX only —
// THIS server action is the real boundary: it re-gates (customer + own-project + AI_CUSTOMER) and writes
// through addNoteAction, which independently re-checks customer ownership. So a direct/forged call with an
// arbitrary body is still safe (fully gated + length-capped; author/role/visibility forced server-side). A
// customer's note is public to their project team (isPublic:true passed explicitly). No other write is
// reachable from the customer path.
export async function aiCustomerCommentAction(accessId, body) {
  const tok = await getSessionRole();
  if (!tok || tok.role !== "customer") return { error: "Unavailable." };
  if (!customerAiOn()) return { error: "Unavailable." };
  const owns = (tok.viaPin && String(tok.accessId) === String(accessId)) || customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email });
  if (!owns) return { error: "Unavailable." };
  const text = String(body || "").trim().slice(0, 500);
  if (text.length < 2) return { error: "Nothing to send." };
  const r = await addNoteAction(accessId, text, true);   // isPublic:true — visible to the project team (explicit, not relying on another module's default)
  if (r?.error) return { error: r.error };
  return { ok: true, message: "Sent to your project team." };
}

// #7 — apply a customer's captured OBJECTION/concern (the second customer-facing write). Like the comment
// action, the Send/Cancel confirm is UX only — THIS action is the real boundary: it re-gates (customer +
// own-project + AI_CUSTOMER), re-validates the taxonomy, and RE-RESOLVES the device server-side (a client id
// must be a real device on THIS project or the binding is dropped — no cross-project id). It records an
// internal, non-destructive review item (addFeedbackNote, role=customer → visible to the team, status 'open').
// It NEVER changes the proposal — staff turn it into a revision later (propose_change / remove_line).
export async function aiCustomerFeedbackAction(accessId, { body, feedbackKind, deviceId } = {}) {
  const tok = await getSessionRole();
  if (!tok || tok.role !== "customer") return { error: "Unavailable." };
  if (!customerAiOn()) return { error: "Unavailable." };
  const owns = (tok.viaPin && String(tok.accessId) === String(accessId)) || customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email });
  if (!owns) return { error: "Unavailable." };
  const text = String(body || "").trim().slice(0, 500);
  if (text.length < 2) return { error: "Nothing to send." };
  const kind = FEEDBACK_KINDS.includes(String(feedbackKind)) ? String(feedbackKind) : "feedback:concern";
  let did = null, dlabel = null;
  if (deviceId != null) {
    const dev = (getProjectDevices(accessId) || []).find((d) => String(d.id) === String(deviceId));
    if (dev) { did = dev.id; dlabel = candidateView(dev).display; }
  }
  addFeedbackNote(accessId, { role: "customer", name: actorName(tok), body: text, kind, deviceId: did, deviceLabel: dlabel });
  logProjectEvent(accessId, { kind: "feedback", label: `Customer concern${dlabel ? ` on ${dlabel}` : ""} — ${kind}`, actor: actorName(tok) });
  return { ok: true, message: "Shared with your project team." };
}
