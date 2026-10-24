// AI "answer" layer — read-only business questions. The assistant RETRIEVES real data and tells you,
// instead of only navigating or editing. Every read is whitelisted here, runs an EXISTING db function,
// and is authorized server-side; the text is built ONLY from fetched rows, never invented. Pure except for
// the db functions the caller injects (ctx.db), so it unit-tests with fakes. Phase-1 read set; more plug in
// by adding a QUERIES entry.
//
// ctx: { role, userId, currentAccessId, can, db: { getActiveProposal, getJobByAccessId, getReceivables,
//        getVisibleJobs, searchProjects }, fin: { optionTotals } }
// A read returns { text, facts } on success, or { error, reason } on a handled miss (reason feeds the
// future training loop: "no_data" | "permission" | "unsupported_read" | "ambiguous").

import { projectIntel } from "./project-intel.js";
import { resolveDevice } from "./device-resolver.js";
import { describeCoverage } from "./device-coverage.js";
import { feedbackLabel } from "./feedback-model.js";
import { signatureNudge } from "./signature-cadence.js";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const STAGE_LABEL = {
  inquiry: "Inquiry", site_survey: "Site Survey", proposal: "Proposal", approval_deposit: "Approval & Deposit",
  schedule: "Schedule", install: "Install", qc: "Quality Control", payment: "Payment", completion: "Completion",
};
const stageLabel = (s) => STAGE_LABEL[s] || titleCase(String(s || "").replace(/_/g, " "));

// The grand total the customer sees = the selected (or first) option's grand, not the sum of every option.
function proposalGrand(row, fin) {
  if (!row?.payload) return null;
  let payload; try { payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload; } catch { return null; }
  const opts = payload?.options || [];
  if (!opts.length) return null;
  const opt = opts.find((o) => o.id === row.selected_option) || opts[0];
  try { return fin.optionTotals(opt, +row.tax_rate || 0, payload.discount, +row.deposit_pct || 50, payload.pcp_credit).grand; }
  catch { return null; }
}

// Admin/manager see everything; everyone else is scoped to the projects they can see (getVisibleJobs
// already applies restricted/assignment rules) — so a read never reveals a project the user can't open.
const isPrivileged = (ctx) => ctx.role === "admin" || ctx.role === "manager";
function visibleSet(ctx) {
  if (isPrivileged(ctx)) return null;   // null = no restriction
  return new Set((ctx.db.getVisibleJobs(ctx.userId, ctx.role) || []).map((j) => String(j.access_id).toLowerCase()));
}
const canSee = (vis, accessId) => vis == null || vis.has(String(accessId || "").toLowerCase());

// Capability gates for money (checked IN ADDITION to project-level visibility above, never instead of it):
//   financials = retail totals / balance (customer.financials.view) · cost = COGS (cost.view) ·
//   payout = technician pay (install.pay.view; a tech additionally only ever sees their OWN, on their jobs).
const canFinancials = (ctx) => !ctx.can || ctx.can(ctx.role, "customer.financials.view");
const canPayout = (ctx) => !!ctx.can && ctx.can(ctx.role, "install.pay.view");
const internalRole = (ctx) => !["customer", "vendor"].includes(ctx.role);   // sees ops/parallel-prep detail

// Resolve a target reference ("Crazy Cars", an access id, "this"/"that"/null) to a project row the caller is
// allowed to see. Null/"this" → the current project context; otherwise search by name. { row } | { error }.
function resolveProject(target, ctx) {
  const t = String(target || "").trim();
  const vis = visibleSet(ctx);
  // ownedAccessId: a single project whose ownership the caller already proved (customer path) — always visible,
  // regardless of the getVisibleJobs filter (which isn't a per-customer ownership check).
  const gated = (row) => (row && (canSee(vis, row.access_id) || (ctx.ownedAccessId && String(row.access_id) === String(ctx.ownedAccessId))) ? { row } : { error: `I couldn't find a project matching "${t || "that"}".`, reason: "no_data" });
  const useCurrent = !t || /^(this|that|current|it|the project|here)$/i.test(t) || /this (one|project|customer)/i.test(t);
  if (useCurrent) {
    if (!ctx.currentAccessId) return { error: "Which project? Open one or name it.", reason: "ambiguous" };
    return gated(ctx.db.getJobByAccessId(ctx.currentAccessId));
  }
  if (/^[A-Za-z]{3}\d{3,}$/.test(t)) { const row = ctx.db.getJobByAccessId(t); if (row) return gated(row); }
  const hits = (ctx.db.searchProjects(t) || []).filter((h) => canSee(vis, h.access_id)).slice(0, 5);
  if (!hits.length) return { error: `I couldn't find a project matching "${t}".`, reason: "no_data" };
  if (hits.length > 1 && !hits.some((h) => (h.customer || "").toLowerCase() === t.toLowerCase())) {
    return { error: `Which one — ${hits.slice(0, 3).map((h) => h.customer || h.access_id).join(", ")}?`, reason: "ambiguous" };
  }
  const top = hits.find((h) => (h.customer || "").toLowerCase() === t.toLowerCase()) || hits[0];
  return gated(ctx.db.getJobByAccessId(top.access_id));
}

const QUERIES = {
  // "How much is the Crazy Cars proposal?" → the selected option's grand total. Retail price → financials cap
  // (a technician / vendor is refused; they never see retail).
  proposal_total: { cap: "customer.financials.view", run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const name = r.row.customer || r.row.access_id;
    const prop = ctx.db.getActiveProposal(r.row.access_id);
    if (!prop || prop.status === "draft") return { text: `${name} doesn't have a sent proposal yet.`, facts: [] };
    const grand = proposalGrand(prop, ctx.fin);
    if (grand == null) return { error: `I couldn't read ${name}'s proposal total.`, reason: "no_data" };
    const signed = prop.signed_name ? " (signed)" : prop.status === "accepted" ? " (accepted)" : "";
    return { text: `${name}'s proposal total is ${money(grand)}${signed}.`, facts: [`${name} proposal total: ${money(grand)}`], project: { accessId: r.row.access_id, name } };
  } },

  // "What's going on with Crazy Cars?" → stage + proposal status + the clear next step.
  project_status: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const prop = ctx.db.getActiveProposal(j.access_id);
    const bits = [`${name} is at the ${stageLabel(j.stage)} stage`];
    if (prop && prop.status !== "draft") {
      const st = prop.signed_name ? "signed" : prop.status === "accepted" ? "accepted, awaiting signature"
        : prop.status === "changes_requested" ? "changes requested" : prop.status === "declined" ? "declined" : "sent, awaiting signature";
      // Money only for roles allowed to see retail (a tech sees the stage + proposal state, never the total).
      const grand = canFinancials(ctx) ? proposalGrand(prop, ctx.fin) : null;
      bits.push(grand != null ? `the proposal (${money(grand)}) is ${st}` : `the proposal is ${st}`);
    } else if (prop) bits.push("the proposal is still a draft");
    const facts = [`${name}: ${stageLabel(j.stage)}`];
    if (prop?.signed_name == null && prop?.status && prop.status !== "draft") facts.push(`${name} proposal awaiting signature`);
    return { text: bits.join("; ") + ".", facts, project: { accessId: j.access_id, name } };
  } },

  // "Which proposals aren't signed?" → projects sitting at the proposal stage. This is the SAME canonical
  // signal the dashboard's Action Center and the "N awaiting signature" counter use (a project is awaiting
  // the customer's signature while its lifecycle stage is `proposal`), so the assistant agrees with every
  // other surface. Authorization-scoped: getVisibleJobs already applies the per-role visibility rules.
  awaiting_signature: { run: (_intent, ctx) => {
    const rows = (ctx.db.getVisibleJobs(ctx.userId, ctx.role) || []).filter((j) => j.stage === "proposal");
    if (!rows.length) return { text: "No proposals are awaiting signature right now.", facts: [] };
    const names = rows.map((j) => j.customer || j.contact_name || j.access_id);
    return { text: `${names.length} proposal${names.length === 1 ? "" : "s"} awaiting signature: ${names.slice(0, 8).join(", ")}${names.length > 8 ? `, +${names.length - 8} more` : ""}.`, facts: [`${names.length} proposals awaiting signature`] };
  } },

  // "What's next / what's holding us up / whose turn is it / what else can we do / what should I focus on?"
  // The operational brain: blocker vs recommended action vs parallel prep, with owners. No money here.
  project_next: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const facts = ctx.db.buildStageFacts(j.access_id);
    if (!facts) return { error: `I couldn't read ${name}'s status.`, reason: "no_data" };
    const assignments = ctx.db.getProjectAssignments ? ctx.db.getProjectAssignments(j.access_id) : [];
    const intel = projectIntel(facts, assignments);
    const parts = [`${name} is at the ${intel.stageLabel} stage`];
    if (intel.canAdvance) {
      parts.push(intel.nextStage ? `nothing is blocking it — it's ready to move to ${intel.nextStageLabel}` : "every stage is complete");
    } else {
      const b = intel.blockers[0];
      parts.push(`the blocker is "${b.label}" — ${b.owner === "customer" ? "the customer's turn" : "the " + b.owner + "'s turn"}`);
      if (intel.recommended) parts.push(`recommended: ${intel.recommended.action}`);
      if (internalRole(ctx) && intel.parallel.length) parts.push(`meanwhile you can ${intel.parallel.slice(0, 3).join(", ")}`);
    }
    const fx = [`${name}: ${intel.stageLabel}${intel.blockers.length ? ` — blocked (${intel.blockers[0].owner})` : " — clear"}`];
    return { text: parts.join(". ") + ".", facts: fx, project: { accessId: j.access_id, name } };
  } },

  // "What's the balance / how much has been paid?" → retail financials, cap-gated (never a tech/vendor).
  project_money: { cap: "customer.financials.view", run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const fs = ctx.db.getProjectFinancialState ? ctx.db.getProjectFinancialState(j.access_id) : null;
    if (!fs || !fs.total) return { text: `${name} has no billable proposal yet.`, facts: [], project: { accessId: j.access_id, name } };
    const bal = fs.balance != null ? fs.balance : (fs.total - fs.paid);
    const bits = [`${name}: total ${money(fs.total)}`, `paid ${money(fs.paid)}`, `balance ${money(bal)}`];
    if (fs.pendingPayments > 0) bits.push(`${money(fs.pendingPayments)} pending confirmation`);
    return { text: bits.join(" · ") + ".", facts: [`${name} balance ${money(bal)}`], project: { accessId: j.access_id, name } };
  } },

  // "What's my payout?" → payout cap AND project-level access; a technician only ever sees their OWN, and
  // only on a job they're actually assigned to (no cross-job leak).
  project_payout: { cap: "install.pay.view", run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    if (ctx.role === "tech") {
      const assignments = ctx.db.getProjectAssignments ? ctx.db.getProjectAssignments(j.access_id) : [];
      const mine = (j.tech && ctx.userName && String(j.tech).toLowerCase() === String(ctx.userName).toLowerCase())
        || assignments.some((a) => a.role === "tech" && String(a.user_id) === String(ctx.userId));
      if (!mine) return { error: "That isn't a job you're assigned to.", reason: "permission" };
    }
    const amt = +j.payout_amount || 0;
    if (!amt) return { text: `${name} doesn't have a payout set yet.`, facts: [], project: { accessId: j.access_id, name } };
    const who = ctx.role === "tech" ? "Your payout" : `${name} payout`;
    return { text: `${who} is ${money(amt)} (${j.payout_status || "pending"}).`, facts: [`${name} payout ${money(amt)}`], project: { accessId: j.access_id, name } };
  } },

  // "Any open issues?" → open install/QC issue flags (install_issues state machine).
  project_issues: { cap: "issue.view", run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const issues = (ctx.db.listInstallIssues ? ctx.db.listInstallIssues(j.access_id) : []) || [];
    const open = issues.filter((i) => !["RESOLVED", "DISMISSED"].includes(String(i.status || "").toUpperCase()));
    if (!open.length) return { text: `${name} has no open issues.`, facts: [], project: { accessId: j.access_id, name } };
    const labels = open.map((i) => i.title || i.label || i.summary || i.note || String(i.status)).filter(Boolean);
    return { text: `${name} has ${open.length} open issue${open.length === 1 ? "" : "s"}${labels.length ? ": " + labels.slice(0, 6).join(", ") : ""}.`, facts: [`${name} ${open.length} open issues`], project: { accessId: j.access_id, name } };
  } },

  // "How long has this been in this stage?" → days at the current stage (from the project's own timestamps).
  project_timeline: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const facts = ctx.db.buildStageFacts ? ctx.db.buildStageFacts(j.access_id) : null;
    const stage = facts?.stage || j.stage;
    const since = j.stage_changed_at || j.updated_at || j.created_at;
    const ms = since ? Date.now() - new Date(since).getTime() : null;
    const days = ms != null && ms >= 0 ? Math.floor(ms / 86400000) : null;
    const t = days == null ? `${name} is at the ${stageLabel(stage)} stage.` : `${name} has been at the ${stageLabel(stage)} stage for ${days} day${days === 1 ? "" : "s"}.`;
    return { text: t, facts: [`${name}: ${stageLabel(stage)}${days != null ? ` ${days}d` : ""}`], project: { accessId: j.access_id, name } };
  } },

  // "What does camera 3 cover?" / "why is there a camera at the entrance?" / "where is camera 3 aimed?" →
  // explain ONE device's coverage from the Site Survey (device-resolver + survey facts). Read-only; the text
  // states only stored survey facts (location, aim°, FOV°, reach ft), never invented. Ambiguous → clarify.
  device_coverage: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const devices = ctx.db.getProjectDevices ? (ctx.db.getProjectDevices(j.access_id) || []) : [];
    if (!devices.length) return { text: `${name} has no placed survey devices yet.`, facts: [], project: { accessId: j.access_id, name } };
    const hit = resolveDevice(intent.ref || "", devices);
    if (hit.candidates) return { error: `Which device — ${hit.candidates.map((c) => c.display).join(", ")}?`, reason: "ambiguous" };
    if (!hit.device) return { error: `I couldn't tell which device you mean on ${name}. Try its number or location — e.g. "camera 3" or "the entrance camera".`, reason: "no_data" };
    const d = hit.device, text = describeCoverage(d);
    // device locator → the client highlights it on the planner/layout (floor-plan highlight).
    return { text, facts: [text], project: { accessId: j.access_id, name }, device: { id: d.id, cid: d.cid || null, floor: d.floor, code: d.code, label: d.label, accessId: j.access_id } };
  } },

  // "What's the feedback / any objections / open concerns" → summarize captured feedback (Phase 3.2) for the
  // project: open items (by kind, with the bound device) + reviewed/resolved counts. Sales intelligence; reads
  // only what was logged, never invented. No cost/margin/payout here (feedback carries none).
  feedback_summary: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const items = (ctx.db.listFeedback ? ctx.db.listFeedback(j.access_id) : []) || [];
    if (!items.length) return { text: `${name} has no logged feedback yet.`, facts: [], project: { accessId: j.access_id, name } };
    const open = items.filter((i) => (i.feedback_status || "open") === "open");
    const reviewed = items.filter((i) => i.feedback_status === "reviewed").length;
    const resolved = items.filter((i) => i.feedback_status === "resolved").length;
    const labels = open.slice(0, 6).map((i) => feedbackLabel(i.feedback_kind) + (i.feedback_device_label ? ` (${i.feedback_device_label})` : ""));
    let text = `${name}: ${open.length} open feedback item${open.length === 1 ? "" : "s"}`;
    if (labels.length) text += ` — ${labels.join(", ")}`;
    const tail = [reviewed ? `${reviewed} reviewed` : null, resolved ? `${resolved} resolved` : null].filter(Boolean).join(", ");
    text += tail ? `. ${tail}.` : ".";
    return { text, facts: [`${name} ${open.length} open feedback`], project: { accessId: j.access_id, name } };
  } },

  // "Who needs a signature nudge?" → sent-but-unsigned proposals DUE for a reminder per the cadence. A QUEUE
  // for a human to send (via request_signature); it NEVER auto-sends. Reads aging/deadline from getReceivables
  // and the count/recency of "signature request emailed" events — no new storage.
  signature_nudges: { cap: "proposal.reuse", run: (intent, ctx) => {   // sales/office chase list — not techs
    const now = Date.now(), DAY = 86400000;
    const vis = visibleSet(ctx);
    const awaiting = ((ctx.db.getReceivables ? ctx.db.getReceivables() : []) || [])
      .filter((r) => r.financialState === "awaiting_signature" && canSee(vis, r.access_id));
    if (!awaiting.length) return { text: "No proposals are awaiting signature right now.", facts: [] };
    const due = [];
    for (const r of awaiting) {
      const events = ctx.db.getProjectEvents ? (ctx.db.getProjectEvents(r.access_id) || []) : [];
      const times = events.filter((e) => e.kind === "email" && /signature request/i.test(e.label || ""))
        .map((e) => new Date(String(e.created_at || "").replace(" ", "T")).getTime()).filter(Number.isFinite);
      const lastAt = times.length ? Math.max(...times) : null;
      const dl = r.signatureDeadline ? new Date(String(r.signatureDeadline).replace(" ", "T")).getTime() : null;
      const n = signatureNudge({
        daysWaiting: r.agingDays,
        signatureEmailCount: times.length,
        daysSinceLastEmail: lastAt != null ? Math.floor((now - lastAt) / DAY) : null,
        daysToDeadline: dl != null ? Math.floor((dl - now) / DAY) : null,
      });
      if (n.due) due.push({ name: r.customer || r.access_id, daysWaiting: Math.max(0, Math.floor(+r.agingDays || 0)), remindersSent: n.remindersSent });
    }
    if (!due.length) return { text: `${awaiting.length} proposal${awaiting.length === 1 ? "" : "s"} awaiting signature, but none are due for a nudge yet.`, facts: [`0 of ${awaiting.length} nudges due`] };
    due.sort((a, b) => b.daysWaiting - a.daysWaiting);
    const list = due.slice(0, 8).map((d) => `${d.name} (${d.daysWaiting}d${d.remindersSent ? `, ${d.remindersSent} sent` : ""})`).join(", ");
    return { text: `${due.length} customer${due.length === 1 ? "" : "s"} due for a signature nudge: ${list}${due.length > 8 ? ", +more" : ""}. Say "remind <name>" to send one.`, facts: [`${due.length} signature nudges due`] };
  } },

  // "Which projects need QC?" / "…are in <stage>?" → authorized project list filtered by lifecycle stage.
  projects_by_stage: { run: (intent, ctx) => {
    const stage = String(intent.stage || intent.target || "").toLowerCase().replace(/[\s-]+/g, "_");
    const key = Object.keys(STAGE_LABEL).find((k) => k === stage || stageLabel(k).toLowerCase() === stage.replace(/_/g, " ")) || stage;
    if (!STAGE_LABEL[key]) return { error: "Which stage — survey, proposal, install, QC, payment…?", reason: "ambiguous" };
    const rows = (ctx.db.getVisibleJobs(ctx.userId, ctx.role) || []).filter((j) => j.stage === key);
    if (!rows.length) return { text: `No projects are in ${stageLabel(key)} right now.`, facts: [] };
    const names = rows.map((j) => j.customer || j.access_id);
    return { text: `${names.length} project${names.length === 1 ? "" : "s"} in ${stageLabel(key)}: ${names.slice(0, 8).join(", ")}${names.length > 8 ? `, +${names.length - 8} more` : ""}.`, facts: [`${names.length} in ${stageLabel(key)}`] };
  } },
};

export const READ_QUERIES = Object.keys(QUERIES);

// Execute a whitelisted read. Authorization is re-checked here (defense in depth); unknown reads are a
// handled miss, not a crash, so the caller can classify + (later) log them.
export function runQuery(intent, ctx) {
  const q = QUERIES[intent?.query];
  if (!q) return { error: "I can't look that up yet.", reason: "unsupported_read" };
  if (q.cap && ctx.can && !ctx.can(ctx.role, q.cap)) return { error: "That's not something your role can view.", reason: "permission" };
  try { return q.run(intent, ctx); }
  catch { return { error: "I hit a snag looking that up — try again.", reason: "error" }; }
}
