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

// Resolve a target reference ("Crazy Cars", an access id, "this"/"that"/null) to a project row the caller is
// allowed to see. Null/"this" → the current project context; otherwise search by name. { row } | { error }.
function resolveProject(target, ctx) {
  const t = String(target || "").trim();
  const vis = visibleSet(ctx);
  const gated = (row) => (row && canSee(vis, row.access_id) ? { row } : { error: `I couldn't find a project matching "${t || "that"}".`, reason: "no_data" });
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
  // "How much is the Crazy Cars proposal?" → the selected option's grand total.
  proposal_total: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const name = r.row.customer || r.row.access_id;
    const prop = ctx.db.getActiveProposal(r.row.access_id);
    if (!prop || prop.status === "draft") return { text: `${name} doesn't have a sent proposal yet.`, facts: [] };
    const grand = proposalGrand(prop, ctx.fin);
    if (grand == null) return { error: `I couldn't read ${name}'s proposal total.`, reason: "no_data" };
    const signed = prop.signed_name ? " (signed)" : prop.status === "accepted" ? " (accepted)" : "";
    return { text: `${name}'s proposal total is ${money(grand)}${signed}.`, facts: [`${name} proposal total: ${money(grand)}`] };
  } },

  // "What's going on with Crazy Cars?" → stage + proposal status + the clear next step.
  project_status: { run: (intent, ctx) => {
    const r = resolveProject(intent.target, ctx); if (r.error) return r;
    const j = r.row, name = j.customer || j.access_id;
    const prop = ctx.db.getActiveProposal(j.access_id);
    const bits = [`${name} is at the ${stageLabel(j.stage)} stage`];
    if (prop && prop.status !== "draft") {
      const grand = proposalGrand(prop, ctx.fin);
      const st = prop.signed_name ? "signed" : prop.status === "accepted" ? "accepted, awaiting signature"
        : prop.status === "changes_requested" ? "changes requested" : prop.status === "declined" ? "declined" : "sent, awaiting signature";
      bits.push(`the proposal (${grand != null ? money(grand) : "—"}) is ${st}`);
    } else if (prop) bits.push("the proposal is still a draft");
    const facts = [`${name}: ${stageLabel(j.stage)}`];
    if (prop?.signed_name == null && prop?.status && prop.status !== "draft") facts.push(`${name} proposal awaiting signature`);
    return { text: bits.join("; ") + ".", facts };
  } },

  // "Which proposals aren't signed?" → sent/accepted proposals without a signature (scoped to visible).
  awaiting_signature: { run: (_intent, ctx) => {
    const vis = visibleSet(ctx);
    const rows = (ctx.db.getReceivables() || []).filter((r) => ["sent", "changes_requested", "accepted"].includes(r.status) && !r.signed_name && !r.declined_at && canSee(vis, r.access_id));
    if (!rows.length) return { text: "Every sent proposal is signed — nothing awaiting signature.", facts: [] };
    const names = rows.map((r) => r.customer || r.contact_name || r.access_id);
    return { text: `${names.length} proposal${names.length === 1 ? "" : "s"} awaiting signature: ${names.slice(0, 8).join(", ")}${names.length > 8 ? `, +${names.length - 8} more` : ""}.`, facts: [`${names.length} proposals awaiting signature`] };
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
