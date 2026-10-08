// The proposal's "unsigned bytes source" for the e-sign engine. The engine (session.js / flatten.js)
// only knows a source as { kind, build() → { bytes, fields, fileName, fingerprint, ref } }, so addendums
// and service agreements can plug in later; v1 wires the proposal only.
//
// The PDF is produced ONCE by the same renderer the Download button uses (lib/proposal-pdf.js), then
// STORED — it is non-deterministic when unsigned (issue date = today), so signing must always target the
// stored bytes, never a regeneration. It is rendered from the CUSTOMER-sanitized proposal (no cost, no
// tech payout) and narrowed to the one option being signed, with no AcroForm widgets (the viewer
// overlays its own fields from `fields`).
//
// Not included in v1: the mockup / site-survey raster appendices. Those are rasterized in the browser
// (html2canvas) and cannot be produced server-side without trusting client-supplied images into a signed
// document. The Download button still carries them. (See LIMITATIONS in the PR.)
import { downloadProposalPdf } from "../proposal-pdf.js";
import { sanitizeProposal, proposalFingerprint } from "../proposal.js";
import { getActiveProposal, getJobByAccessId } from "../db.js";
import { projectFileBase } from "../doc-filename.js";
import { getDocumentInfo, storeDocument, voidDocument, setProposalSignPointers } from "./store.js";

const SIGNABLE = new Set(["sent", "changes_requested", "accepted", "declined"]);

export function proposalFingerprintOf(row) { return proposalFingerprint(row.payload, row.tax_rate, row.deposit_pct); }

// Why a proposal can't be signed right now, or null when it can.
export function signBlocker(row, optKey) {
  if (!row) return "No proposal to sign.";
  if (!SIGNABLE.has(row.status)) return row.status === "draft" ? "The proposal hasn't been sent yet." : "This proposal version is no longer open.";
  if (row.signed_name) return "This proposal is already signed.";
  let payload; try { payload = JSON.parse(row.payload || "{}"); } catch { payload = {}; }
  const opt = (payload.options || []).find((o) => o.id === optKey);
  if (!opt || !(opt.services || []).some((s) => (s.items || []).length)) return "That option isn't available to sign.";
  return null;
}

// Render the unsigned PDF for one option. Pure of side effects except reading the proposal + project.
export function buildProposalUnsigned(accessId, optKey, row = getActiveProposal(accessId)) {
  const why = signBlocker(row, optKey);
  if (why) throw Object.assign(new Error(why), { code: "NOT_SIGNABLE" });
  const project = getJobByAccessId(accessId);
  const san = sanitizeProposal(row, "customer");
  const opt = san.payload.options.find((o) => o.id === optKey);
  const p = {
    ...san,
    payload: { ...san.payload, options: [opt] },
    accepted_options: [], declined_options: {},
    signed_name: null, signed_at: null, signature_data: null, signedPayload: null,
  };
  const meta = {
    customerName: project?.contact_name || project?.customer || "",
    customerAddress: project?.address || "", customerPhone: project?.contact_phone || "", customerEmail: project?.contact_email || "",
    fileBase: projectFileBase(project || { access_id: accessId }), projectId: accessId,
    __return: true, __signing: true, __fields: [],
  };
  const doc = downloadProposalPdf(p, meta, {});
  const bytes = Buffer.from(doc.output("arraybuffer"));
  return {
    bytes, fields: meta.__fields, pageCount: doc.getNumberOfPages(), fileName: doc.__fileName,
    fingerprint: proposalFingerprintOf(row), ref: { proposalId: row.id, version: row.version },
  };
}

// Return the stored unsigned document for (proposal, option) — creating it the first time or whenever
// the signable content drifted (fingerprint changed) — and point the proposal row at it.
export function ensureProposalUnsigned(accessId, optKey, { by = null } = {}) {
  const row = getActiveProposal(accessId);
  const why = signBlocker(row, optKey);
  if (why) return { error: why };
  const fp = proposalFingerprintOf(row);
  if (row.unsigned_doc_id) {
    const cur = getDocumentInfo(row.unsigned_doc_id);
    if (cur && !cur.voided && cur.kind === "unsigned" && cur.proposal_id === row.id && cur.meta?.option === optKey && cur.meta?.fingerprint === fp) {
      return { doc: cur, row, fingerprint: fp, reused: true };
    }
    if (cur && !cur.voided) voidDocument(cur.id);   // stale (content or option changed): keep for history, stop serving
  }
  const built = buildProposalUnsigned(accessId, optKey, row);
  const stored = storeDocument({
    proposalId: row.id, accessId, version: row.version, kind: "unsigned", bytes: built.bytes, createdBy: by,
    meta: { option: optKey, fingerprint: fp, fields: built.fields, pageCount: built.pageCount, fileName: built.fileName },
  });
  setProposalSignPointers(row.id, { unsignedDocId: stored.id });
  return { doc: getDocumentInfo(stored.id), row, fingerprint: fp, reused: false };
}

export const proposalSource = { kind: "proposal", build: buildProposalUnsigned, ensure: ensureProposalUnsigned };
