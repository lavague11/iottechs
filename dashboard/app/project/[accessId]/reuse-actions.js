"use server";
import { headers } from "next/headers";
import { listReusableProposals, previewProposalForClone, cloneProposal, createProposalFromImport, getPriceBook, getActiveProposal, getMedia, searchProjects, getJobByAccessId } from "../../../lib/db";
import { sanitizeProposal, validatePayload } from "../../../lib/proposal";
import { pricingReview, importCandidateToPayload, normalizeCandidate } from "../../../lib/proposal-reuse";
import { can } from "../../../lib/roles";

// Reuse a previous proposal — server actions. Every mutation re-checks the role here; the UI only
// renders. Sales/admin/manager may search, copy and import; internal item fields (cost/techPrice)
// are copied only for admin/manager; customers and technicians are refused outright.

// A login session OR a project PIN grant (the master PIN resolves to admin) — same resolution the
// other project actions use — but only roles with proposal.reuse pass.
async function staffTok() {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const getC = (name) => cookie.split(";").find((c) => c.trim().startsWith(name + "="))?.split("=").slice(1).join("=");
  const { parseToken, parseAccessToken } = await import("../../../lib/auth");
  const raw = getC("iot_session");
  if (raw) { const tok = await parseToken(raw.trim()); if (tok?.role) return can(tok.role, "proposal.reuse") ? tok : null; }
  const acc = getC("iot_access");
  if (acc) { const at = await parseAccessToken(acc.trim()); if (at?.role && can(at.role, "proposal.reuse")) return { role: at.role, accessId: at.accessId, viaPin: true, name: at.role }; }
  return null;
}
const actor = (tok) => tok.name || tok.email || tok.role;

// accessId may be null (New Project form — the project doesn't exist yet); `hint` groups same-customer rows.
export async function searchReusableProposalsAction(accessId, q, hint = null) {
  const tok = await staffTok();
  if (!tok) return { ok: false, error: "Unauthorized.", rows: [] };
  const h = hint && typeof hint === "object" ? { customer: String(hint.customer || "").slice(0, 120), email: String(hint.email || "").slice(0, 120), phone: String(hint.phone || "").slice(0, 40) } : null;
  return { ok: true, rows: listReusableProposals({ q: String(q || "").slice(0, 80), forAccessId: accessId || null, hint: h, limit: 30 }) };
}
export async function previewSourceProposalAction(proposalId) {
  const tok = await staffTok();
  if (!tok) return { ok: false, error: "Unauthorized." };
  const p = previewProposalForClone(proposalId);
  return p ? { ok: true, preview: p } : { ok: false, error: "Not found." };
}
// options: { optionIds, includeNotes, includePaymentPlan, includeDiscount, includeInternal, addendumIds }
export async function cloneProposalAction(destAccessId, { sourceProposalId, options = {} } = {}) {
  const tok = await staffTok();
  if (!tok) return { error: "Unauthorized." };
  const includeInternal = !!options.includeInternal && can(tok.role, "cost.view");
  const res = cloneProposal({ sourceProposalId: Number(sourceProposalId), destAccessId, options, actor: actor(tok), includeInternal });
  if (res.error) return res;
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${destAccessId}`);
  return { ok: true, proposal: sanitizeProposal(res.proposal, tok.role), source: res.source, review: pricingReview(res.proposal.payload, getPriceBook()) };
}
// Pricing review for the current draft (used after a clone and on demand).
export async function pricingReviewAction(accessId) {
  const tok = await staffTok();
  if (!tok) return { ok: false, review: [] };
  const cur = getActiveProposal(accessId);
  if (!cur) return { ok: true, review: [] };
  return { ok: true, review: pricingReview(cur.payload, getPriceBook()) };
}
// Destination picker for "Use for another project": staff-visible projects matching q, minus the source.
export async function searchDestinationProjectsAction(q, excludeAccessId) {
  const tok = await staffTok();
  if (!tok) return { ok: false, rows: [] };
  const rows = (String(q || "").trim() ? searchProjects(String(q).slice(0, 80)) : []).filter((p) => p.access_id !== excludeAccessId).slice(0, 20)
    .map((p) => { const a = getActiveProposal(p.access_id); return { accessId: p.access_id, customer: p.customer, address: p.address || "", service: p.service_code || null, stage: p.stage, hasProposal: !!a && a.status !== "draft" }; });
  return { ok: true, rows };
}
// Path B, step 2: the reviewed candidate becomes the draft. Nothing from the extraction is saved
// until the user confirms it here.
export async function createProposalFromImportAction(accessId, { candidate, serviceKey, mediaId } = {}) {
  const tok = await staffTok();
  if (!tok) return { error: "Unauthorized." };
  if (mediaId) { const m = getMedia(mediaId); if (!m || String(m.project_access_id).toUpperCase() !== String(accessId).toUpperCase() || m.kind !== "proposal-import") return { error: "Source file doesn't belong to this project." }; }
  const c = normalizeCandidate(candidate);
  const payload = importCandidateToPayload(c, { serviceKey: serviceKey || getJobByAccessId(accessId)?.service_code || null });
  const bad = validatePayload(payload);
  if (bad) return { error: bad };
  const taxRate = c.subtotal && c.tax ? Math.max(0, Math.min(30, Math.round((c.tax / c.subtotal) * 10000) / 100)) : 0;
  const res = createProposalFromImport({ destAccessId: accessId, payload, taxRate, depositPct: payload.payment_plan === "100" ? 100 : 50, mediaId: mediaId || null, actor: actor(tok) });
  if (res.error) return res;
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, proposal: sanitizeProposal(res.proposal, tok.role) };
}
