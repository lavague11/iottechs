// Completion: validate the session one last time, flatten a NEW immutable signed PDF from the stored
// unsigned original, then run the EXISTING lifecycle (selectProposalOption + signProposal) so signed
// fingerprint/snapshot, addendum binding, stage auto-advance and role-stripping keep working unchanged.
// Also writes the certificate of completion, the audit events and the Job Log entry. Replay-proof: the
// session is claimed atomically (open → completing → signed) so a token can finish exactly once.
import { sqliteHandle, getPublishedProposal, getJobByAccessId, selectProposalOption, signProposal, voidProposalSignature, maybeAutoAdvance, logProjectEvent } from "../db.js";
import { getDocument, storeDocument, setProposalSignPointers, recordSignEvent, listSignEvents, sha256Hex } from "./store.js";
import { validateSession } from "./session.js";
import { missingRequired, requiredAcks } from "./capture.js";
import { flattenSigned } from "./flatten.js";
import { buildCertificate } from "./certificate.js";

const h = () => sqliteHandle();
const fail = (code, error) => ({ ok: false, code, error });
const ROLE_LABEL = { customer: "Customer", admin: "Admin (signing on the customer's behalf)", manager: "Manager (signing on the customer's behalf)" };
const EVENT_LABEL = { opened: "Document opened", set_name: "Name entered", set_signature: "Signature adopted", set_acks: "Terms acknowledged", set_placed: "Signature placed", completed: "Signed" };
const ACK_SHORT = { terms: "Master Terms & Conditions", payment: "Prompt payment terms", pcp: "PCP credit terms", survey: "Site survey & system layout", mockup: "Camera mockup", cxEquip: "Customer-provided equipment", existingCable: "Existing cabling", marketing: "Marketing (optional)" };
const METHOD = { draw: "Drawn", type: "Typed", upload: "Uploaded image" };

export async function completeSession({ token, accessId, caller, ip = null, ua = null, now = Date.now() }) {
  const v = validateSession(token, accessId, caller, { now });
  if (!v.ok) return v;
  const { session: s, row, doc, values } = v;
  let payload; try { payload = JSON.parse(row.payload || "{}"); } catch { payload = {}; }
  // Which acknowledgments apply is decided by the STORED unsigned document (does it carry survey / mockup
  // pages), never by the client — so the survey/mockup sign-off can't be skipped or faked.
  const facts = { hasSurvey: !!doc.meta?.hasSurvey, hasMockup: !!doc.meta?.hasMockup, option: s.option_key };
  if (missingRequired(values, payload, facts).length) return fail("MISSING", "Add your signature and agree to the required terms first.");
  // Every signature field must have been placed (and persisted) — the document isn't Approved until all
  // required signatures are in, not just one adopted. The placements come from the session, not the client.
  const sigKeys = (doc.meta?.fields || []).filter((f) => f.opt === s.option_key && f.type === "signature").map((f) => f.key);
  const placedSet = new Set(Array.isArray(values.placed) ? values.placed : []);
  if (sigKeys.some((k) => !placedSet.has(k))) return fail("MISSING", "Place every signature before the document is complete.");

  // Claim the session: only one completion can win; a replay finds it already taken.
  const claim = h().prepare("UPDATE sign_sessions SET state='completing' WHERE id=? AND state='open'").run(s.id);
  if (claim.changes !== 1) return fail("USED", "This document was already signed.");
  const release = () => h().prepare("UPDATE sign_sessions SET state='open' WHERE id=? AND state='completing'").run(s.id);

  let weAccepted = false, signedRow = null, aborted = false;
  const created = [];
  try {
    const unsigned = getDocument(doc.id);
    const fields = (doc.meta?.fields || []).filter((f) => f.opt === s.option_key);
    // Dry run: prove the signature embeds and every field is on a real page BEFORE touching the record.
    await flattenSigned({ unsignedBytes: unsigned.bytes, fields, values, signedAt: new Date().toISOString().replace("T", " ").slice(0, 19) });

    // The dry-run flatten yielded the event loop: a revision may have minted v+1 meanwhile. v+1 clones the payload,
    // so its fingerprint is IDENTICAL and the fingerprint guard below can't see it. Re-assert, with no await between
    // here and signProposal, that the active proposal is still the exact one this session was opened on.
    const live = getPublishedProposal(accessId);
    if (!live || live.id !== s.proposal_id || live.version !== s.version || live.signed_name) {
      h().prepare("UPDATE sign_sessions SET state='void', void_reason='revised' WHERE id=?").run(s.id);
      aborted = true;
      throw new Error("The proposal changed while signing. Reopen it to review the update.");
    }

    // The existing lifecycle — acceptance + signature binding to the content fingerprint.
    const accepted = (() => { try { return JSON.parse(row.accepted_options || "[]").includes(s.option_key); } catch { return false; } })();
    if (!accepted) { if (!selectProposalOption(accessId, s.option_key)) throw new Error("The proposal isn't open for acceptance."); weAccepted = true; }
    signedRow = signProposal(accessId, values.name, values.signature.data, values.acks || null);
    if (!signedRow) throw new Error("The proposal couldn't be signed.");
    if (signedRow.signed_fingerprint !== s.fingerprint) throw new Error("The proposal changed while signing.");

    // Final flatten uses the record's own signed_at so the PDF and the database agree to the minute, and
    // stamps the DocuSign-style certification block (timestamp + signer + verification + IP + doc ref)
    // under the signature — the same facts the standalone Certificate of Completion records.
    const reference = `PROP-${String(row.id).padStart(4, "0")}-v${row.version}`;
    const signedBytes = await flattenSigned({ unsignedBytes: unsigned.bytes, fields, values, signedAt: signedRow.signed_at,
      title: `Signed proposal — ${doc.meta?.fileName || ""}`.trim(),
      meta: { certify: true, reference, fingerprint: s.fingerprint, via: s.via_pin ? "Project PIN" : "Account sign-in", ip } });
    const signedSha = sha256Hex(signedBytes);

    const project = getJobByAccessId(accessId);
    const events = [...listSignEvents(row.id).filter((e) => e.session_id === s.id).map((e) => ({ at: e.created_at, label: `${EVENT_LABEL[e.kind] || e.kind}${e.kind === "set_signature" ? (() => { try { return ` (${(METHOD[JSON.parse(e.detail || "{}").method] || "").toLowerCase()})`; } catch { return ""; } })() : ""}`, ip: e.ip })),
      { at: signedRow.signed_at, label: "Signed", ip }];
    const acks = requiredAcks(payload, facts).map((a) => ({ label: ACK_SHORT[a.key] || a.key, agreed: !!values.acks?.[a.key] }));
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
    // Notify the admin(s) that the contract was signed — fire-and-forget so a slow/failed email NEVER
    // reverses a completed signature. Idempotent: the `admin_notified` event is the key (one per revision;
    // completion runs once per version, and a reopen of a signed doc can't re-complete). Logged either way.
    try {
      const already = listSignEvents(row.id).some((e) => e.kind === "admin_notified");
      if (!already) {
        recordSignEvent({ accessId, proposalId: row.id, sessionId: s.id, kind: "admin_notified", actor: "system", detail: { version: row.version } });
        const projectName = project?.business_name || project?.customer || accessId;
        import("../email.js").then(({ emailContractSigned }) =>
          emailContractSigned(accessId, { signerName: values.name, customerName: project?.contact_name || project?.customer, version: row.version, signedAt: signedRow.signed_at, projectName })
            .then((res) => { try { logProjectEvent(accessId, { kind: "email", label: res?.sent ? `Signed contract — admin notified (${(res.recipients || []).length} recipient${(res.recipients || []).length === 1 ? "" : "s"})` : `Signed contract — admin email not sent (${res?.error || "no recipients"})`, actor: "system" }); } catch { /* log is best-effort */ } })
            .catch((e) => { try { logProjectEvent(accessId, { kind: "email", label: `Signed contract — admin email failed (${e?.message || "error"})`, actor: "system" }); } catch {} })
        ).catch(() => {});
      }
    } catch { /* admin notification is best-effort — never blocks a completed signature */ }
    const stage = maybeAutoAdvance(accessId);
    return { ok: true, stage, row: getPublishedProposal(accessId), signedDocId: stored.id, certificateDocId: cert.id, signedSha256: signedSha };
  } catch (e) {
    // Undo whatever the lifecycle already recorded so a failed completion leaves nothing half-signed.
    try {
      if (signedRow) voidProposalSignature(accessId);
      if (weAccepted) selectProposalOption(accessId, s.option_key);
      for (const id of created) h().prepare("UPDATE sign_documents SET voided=1 WHERE id=?").run(id);
      setProposalSignPointers(row.id, { signedDocId: null, signStatus: "signing" });
    } catch { /* best effort */ }
    if (aborted) return fail("VOID", e.message);   // session already voided — the signer must reopen, not retry
    release();
    return fail("ERROR", e?.message?.startsWith("The proposal") ? e.message : "Couldn't finish signing. Please try again.");
  }
}
