// Completion: validate the session one last time, flatten a NEW immutable signed PDF from the stored
// unsigned original, then run the EXISTING lifecycle (selectProposalOption + signProposal) so signed
// fingerprint/snapshot, addendum binding, stage auto-advance and role-stripping keep working unchanged.
// Also writes the certificate of completion, the audit events and the Job Log entry. Replay-proof: the
// session is claimed atomically (open → completing → signed) so a token can finish exactly once.
import { sqliteHandle, getActiveProposal, getJobByAccessId, selectProposalOption, signProposal, voidProposalSignature, maybeAutoAdvance, logProjectEvent } from "../db.js";
import { getDocument, storeDocument, setProposalSignPointers, recordSignEvent, listSignEvents, sha256Hex } from "./store.js";
import { validateSession } from "./session.js";
import { missingRequired } from "./capture.js";
import { flattenSigned } from "./flatten.js";
import { buildCertificate } from "./certificate.js";
import { PROPOSAL_ACKS } from "../proposal-terms.js";

const h = () => sqliteHandle();
const fail = (code, error) => ({ ok: false, code, error });
const ROLE_LABEL = { customer: "Customer", admin: "Admin (signing on the customer's behalf)", manager: "Manager (signing on the customer's behalf)" };
const EVENT_LABEL = { opened: "Document opened", set_name: "Name entered", set_signature: "Signature adopted", set_acks: "Terms acknowledged", completed: "Signed" };
const ACK_SHORT = { terms: "Master Terms & Conditions", payment: "Prompt payment terms", pcp: "PCP credit terms", marketing: "Marketing (optional)" };
const METHOD = { draw: "Drawn", type: "Typed", upload: "Uploaded image" };

export async function completeSession({ token, accessId, caller, ip = null, ua = null, now = Date.now() }) {
  const v = validateSession(token, accessId, caller, { now });
  if (!v.ok) return v;
  const { session: s, row, doc, values } = v;
  let payload; try { payload = JSON.parse(row.payload || "{}"); } catch { payload = {}; }
  if (missingRequired(values, payload).length) return fail("MISSING", "Add your signature and agree to the required terms first.");

  // Claim the session: only one completion can win; a replay finds it already taken.
  const claim = h().prepare("UPDATE sign_sessions SET state='completing' WHERE id=? AND state='open'").run(s.id);
  if (claim.changes !== 1) return fail("USED", "This document was already signed.");
  const release = () => h().prepare("UPDATE sign_sessions SET state='open' WHERE id=? AND state='completing'").run(s.id);

  let weAccepted = false, signedRow = null;
  const created = [];
  try {
    const unsigned = getDocument(doc.id);
    const fields = (doc.meta?.fields || []).filter((f) => f.opt === s.option_key);
    // Dry run: prove the signature embeds and every field is on a real page BEFORE touching the record.
    await flattenSigned({ unsignedBytes: unsigned.bytes, fields, values, signedAt: new Date().toISOString().replace("T", " ").slice(0, 19) });

    // The existing lifecycle — acceptance + signature binding to the content fingerprint.
    const accepted = (() => { try { return JSON.parse(row.accepted_options || "[]").includes(s.option_key); } catch { return false; } })();
    if (!accepted) { if (!selectProposalOption(accessId, s.option_key)) throw new Error("The proposal isn't open for acceptance."); weAccepted = true; }
    signedRow = signProposal(accessId, values.name, values.signature.data, values.acks || null);
    if (!signedRow) throw new Error("The proposal couldn't be signed.");
    if (signedRow.signed_fingerprint !== s.fingerprint) throw new Error("The proposal changed while signing.");

    // Final flatten uses the record's own signed_at so the PDF and the database agree to the minute.
    const signedBytes = await flattenSigned({ unsignedBytes: unsigned.bytes, fields, values, signedAt: signedRow.signed_at, title: `Signed proposal — ${doc.meta?.fileName || ""}`.trim() });
    const signedSha = sha256Hex(signedBytes);

    const project = getJobByAccessId(accessId);
    const reference = `PROP-${String(row.id).padStart(4, "0")}-v${row.version}`;
    const events = [...listSignEvents(row.id).filter((e) => e.session_id === s.id).map((e) => ({ at: e.created_at, label: `${EVENT_LABEL[e.kind] || e.kind}${e.kind === "set_signature" ? (() => { try { return ` (${(METHOD[JSON.parse(e.detail || "{}").method] || "").toLowerCase()})`; } catch { return ""; } })() : ""}`, ip: e.ip })),
      { at: signedRow.signed_at, label: "Signed", ip }];
    const acks = PROPOSAL_ACKS.filter((a) => !a.pcpOnly || +(payload.pcp_credit || 0) > 0).map((a) => ({ label: ACK_SHORT[a.key] || a.key, agreed: !!values.acks?.[a.key] }));
    const certBytes = await buildCertificate({
      reference, version: row.version, optionKey: s.option_key, projectId: String(accessId), fileName: doc.meta?.fileName || null,
      fingerprint: s.fingerprint, unsignedSha256: doc.sha256, signedSha256: signedSha, signedAt: signedRow.signed_at,
      signer: { name: values.name, role: ROLE_LABEL[caller.role] || caller.role, email: s.signer_email || project?.contact_email || null, via: s.via_pin ? "Project PIN" : "Account sign-in" },
      ip, ua,
      fields: [
        { label: "Name", method: "Typed by the signer" },
        { label: "Signature", method: METHOD[values.signature.method] || values.signature.method },
        { label: "Date", method: "Stamped by the server at signing" },
      ],
      acks, events,
    });
    const cert = storeDocument({ proposalId: row.id, accessId, version: row.version, kind: "certificate", bytes: certBytes, createdBy: values.name, meta: { option: s.option_key, signedSha256: signedSha, fileName: `Certificate of Completion - ${reference}.pdf` } });
    const baseName = (doc.meta?.fileName || "Proposal.pdf").replace(/\.pdf$/i, "");
    created.push(cert.id);
    const stored = storeDocument({ proposalId: row.id, accessId, version: row.version, kind: "signed", bytes: signedBytes, createdBy: values.name,
      meta: { option: s.option_key, fromDocId: doc.id, unsignedSha256: doc.sha256, fingerprint: s.fingerprint, certificateDocId: cert.id, signer: values.name, signedAt: signedRow.signed_at, fileName: `${baseName} - Signed.pdf` } });
    created.push(stored.id);
    setProposalSignPointers(row.id, { signedDocId: stored.id, signStatus: "signed" });
    h().prepare("UPDATE sign_sessions SET state='signed', completed_at=datetime('now','localtime') WHERE id=?").run(s.id);
    recordSignEvent({ accessId, proposalId: row.id, sessionId: s.id, kind: "completed", actor: values.name, ip, ua,
      detail: { signedDocId: stored.id, certificateDocId: cert.id, unsignedSha256: doc.sha256, signedSha256: signedSha, fingerprint: s.fingerprint } });
    logProjectEvent(accessId, { kind: "sign", label: `Proposal v${row.version} signed (PDF) — Option ${s.option_key} by ${values.name}`, actor: values.name });
    const stage = maybeAutoAdvance(accessId);
    return { ok: true, stage, row: getActiveProposal(accessId), signedDocId: stored.id, certificateDocId: cert.id, signedSha256: signedSha };
  } catch (e) {
    // Undo whatever the lifecycle already recorded so a failed completion leaves nothing half-signed.
    try {
      if (signedRow) voidProposalSignature(accessId);
      if (weAccepted) selectProposalOption(accessId, s.option_key);
      for (const id of created) h().prepare("UPDATE sign_documents SET voided=1 WHERE id=?").run(id);
      setProposalSignPointers(row.id, { signedDocId: null, signStatus: "signing" });
    } catch { /* best effort */ }
    release();
    return fail("ERROR", e?.message?.startsWith("The proposal") ? e.message : "Couldn't finish signing. Please try again.");
  }
}
