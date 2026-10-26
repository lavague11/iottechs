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
import { getPublishedProposal, getActiveProposal, getJobByAccessId } from "../db.js";
import { projectFileBase } from "../doc-filename.js";
import { getDocumentInfo, storeDocument, voidDocument, setProposalSignPointers } from "./store.js";

const SIGNABLE = new Set(["sent", "changes_requested", "accepted", "declined"]);

export function proposalFingerprintOf(row) { return proposalFingerprint(row.payload, row.tax_rate, row.deposit_pct); }

// THE ONE canonical signer identity. This is the exact value that renders as the proposal's
// "PREPARED FOR" / "CLIENT NAME" (lib/proposal-pdf.js reads meta.customerName), so the signer's
// name, the signature modal's Name field, the typed-signature preview and the audit name all come
// from here — never from the project/business/property name independently. Blank when unknown
// (then the signer falls back to letting the customer type their name).
export function proposalSignerName(accessId, project = getJobByAccessId(accessId)) {
  return String(project?.contact_name || project?.customer || "").trim();
}

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

// Validate + bound the client-rendered appendix images (site-survey floor plans + system mockup) before
// they go into a SIGNED document. The customer's browser rasterizes them (the same exportSurvey2Images /
// exportMockupImages the Download uses) because they can't be produced server-side; we only accept well-
// formed, size-capped data: images, and never more than a sane page count. The survey/mockup DATA remains
// the source of truth — these are the visual snapshot the customer reviews and approves.
const MAX_APPENDIX_IMG = 6_000_000;     // ~6 MB per rendered page — a crisp 2400px floor-plan PNG fits
const MAX_APPENDIX_PAGES = 20;          // per section (survey, mockup)
const MAX_APPENDIX_TOTAL = 32_000_000;  // whole-appendix byte budget, so a signed BLOB stays bounded
function okImg(s) { return typeof s === "string" && /^data:image\/(png|jpeg);base64,/.test(s) && s.length <= MAX_APPENDIX_IMG; }
export function cleanAppendix(appendix) {
  if (!appendix || typeof appendix !== "object") return { surveyImages: [], mockupImages: [] };
  let budget = MAX_APPENDIX_TOTAL;
  const take = (s) => { if (s.length > budget) return false; budget -= s.length; return true; };   // running total guard
  const surveyImages = (Array.isArray(appendix.surveyImages) ? appendix.surveyImages : [])
    .filter((f) => f && okImg(f.img)).slice(0, MAX_APPENDIX_PAGES).filter((f) => take(f.img))
    .map((f) => ({ name: String(f.name || "").slice(0, 80), img: f.img, counts: f.counts || null }));
  const mockupImages = (Array.isArray(appendix.mockupImages) ? appendix.mockupImages : [])
    .filter(okImg).slice(0, MAX_APPENDIX_PAGES).filter(take);
  return { surveyImages, mockupImages };
}
// A short, order-independent fingerprint of the accepted appendix — lets the stored unsigned doc rebuild
// when the survey/mockup the customer will sign changes, without recomputing the whole PDF to compare.
export function appendixHash(clean) {
  const parts = [...(clean.surveyImages || []).map((f) => (f.name || "") + ":" + f.img.length), ...(clean.mockupImages || []).map((s) => "m:" + s.length)];
  let h = 5381; const str = parts.join("|");
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + "-" + parts.length;
}

// Render the unsigned PDF for one option. Pure of side effects except reading the proposal + project.
// `appendix` (optional) = client-rendered { surveyImages:[{name,img}], mockupImages:[dataURL] } — appended
// as the site-survey + mockup pages so the customer reviews and signs the WHOLE document, not just pricing.
export function buildProposalUnsigned(accessId, optKey, row = getPublishedProposal(accessId), appendix = null) {
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
    customerName: proposalSignerName(accessId, project),
    customerAddress: project?.address || "", customerPhone: project?.contact_phone || "", customerEmail: project?.contact_email || "",
    fileBase: projectFileBase(project || { access_id: accessId }), projectId: accessId,
    __return: true, __signing: true, __fields: [],
  };
  const clean = cleanAppendix(appendix);
  const doc = downloadProposalPdf(p, meta, { surveyImages: clean.surveyImages, mockupImages: clean.mockupImages });
  const bytes = Buffer.from(doc.output("arraybuffer"));
  return {
    bytes, fields: meta.__fields, pageCount: doc.getNumberOfPages(), fileName: doc.__fileName,
    fingerprint: proposalFingerprintOf(row), appendixHash: appendixHash(clean),
    hasSurvey: clean.surveyImages.length > 0, hasMockup: clean.mockupImages.length > 0,
    ref: { proposalId: row.id, version: row.version },
  };
}

const EMPTY_APPENDIX_HASH = appendixHash(cleanAppendix(null));

// Return the stored unsigned document for (proposal, option) — creating it the first time, whenever the
// signable content drifted (fingerprint changed), OR whenever the client-rendered survey/mockup appendix
// changed (appendixHash) — and point the proposal row at it. The stored doc's meta records which pages it
// carries (hasSurvey/hasMockup) so the consent step gates the survey/mockup acknowledgments on the ACTUAL
// signed document, never on anything the client claims.
export function ensureProposalUnsigned(accessId, optKey, { by = null, appendix = null } = {}) {
  // The customer signs the PUBLISHED version they received — never a staff working draft. (Phase 3.)
  // Fall back to the working row ONLY to produce the right blocker message ("hasn't been sent yet") when
  // nothing has been published — signBlocker then refuses it, so a draft is never actually made signable.
  const row = getPublishedProposal(accessId) || getActiveProposal(accessId);
  const why = signBlocker(row, optKey);
  if (why) return { error: why };
  const fp = proposalFingerprintOf(row);
  // appendix == null means "use the current document as-is" (the signer opens the session right after
  // /api/esign/prepare already built the doc WITH the appendix) — so a null appendix reuses on content +
  // option alone and never rebuilds the pages away. A supplied appendix is matched by its hash.
  const apx = appendix == null ? null : appendixHash(cleanAppendix(appendix));
  if (row.unsigned_doc_id) {
    const cur = getDocumentInfo(row.unsigned_doc_id);
    const apxOk = apx == null || (cur?.meta?.appendixHash || EMPTY_APPENDIX_HASH) === apx;
    if (cur && !cur.voided && cur.kind === "unsigned" && cur.proposal_id === row.id && cur.meta?.option === optKey
        && cur.meta?.fingerprint === fp && apxOk) {
      return { doc: cur, row, fingerprint: fp, reused: true };
    }
    if (cur && !cur.voided) voidDocument(cur.id);   // stale (content, option or appendix changed): keep for history, stop serving
  }
  const built = buildProposalUnsigned(accessId, optKey, row, appendix);
  const stored = storeDocument({
    proposalId: row.id, accessId, version: row.version, kind: "unsigned", bytes: built.bytes, createdBy: by,
    meta: { option: optKey, fingerprint: fp, fields: built.fields, pageCount: built.pageCount, fileName: built.fileName,
      appendixHash: built.appendixHash, hasSurvey: built.hasSurvey, hasMockup: built.hasMockup },
  });
  setProposalSignPointers(row.id, { unsignedDocId: stored.id });
  return { doc: getDocumentInfo(stored.id), row, fingerprint: fp, reused: false };
}

export const proposalSource = { kind: "proposal", build: buildProposalUnsigned, ensure: ensureProposalUnsigned };
