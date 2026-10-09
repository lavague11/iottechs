// E-sign document + audit store. Bytes live in SQLite (BLOB) next to the proposal they belong to.
// Documents are immutable (see schema.js triggers); "removing" one only sets voided=1.
import { createHash, randomBytes } from "node:crypto";
import { sqliteHandle } from "../db.js";

const h = () => sqliteHandle();

export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const newId = (n = 16) => randomBytes(n).toString("hex");
const toBuffer = (b) => (Buffer.isBuffer(b) ? b : Buffer.from(b));

// Store one document. `meta` is JSON-able (page count, option key, field layout…).
export function storeDocument({ proposalId, accessId, version, kind, bytes, mime = "application/pdf", meta = null, createdBy = null }) {
  const buf = toBuffer(bytes);
  const id = newId(16);
  const sha = sha256Hex(buf);
  h().prepare(
    "INSERT INTO sign_documents (id, proposal_id, project_access_id, version, kind, mime, sha256, bytes, meta, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(id, Number(proposalId), String(accessId), Number(version) || 1, kind, mime, sha, buf, meta ? JSON.stringify(meta) : null, createdBy ? String(createdBy).slice(0, 120) : null);
  return { id, sha256: sha, size: buf.length };
}

// Row WITHOUT the bytes (cheap: used for gating, listing and hash checks that don't need the file).
export function getDocumentInfo(id) {
  if (!id) return null;
  const r = h().prepare("SELECT id, proposal_id, project_access_id, version, kind, mime, sha256, meta, created_by, created_at, voided, length(bytes) AS size FROM sign_documents WHERE id=?").get(String(id));
  if (!r) return null;
  let meta = null; try { meta = r.meta ? JSON.parse(r.meta) : null; } catch { meta = null; }
  return { ...r, meta, voided: !!r.voided };
}

export function getDocument(id) {
  const info = getDocumentInfo(id);
  if (!info) return null;
  const r = h().prepare("SELECT bytes FROM sign_documents WHERE id=?").get(String(id));
  return { ...info, bytes: toBuffer(r.bytes) };
}

// Recompute the hash of the stored bytes and compare it to the recorded one (tamper / corruption check).
export function documentIntact(id) {
  const d = getDocument(id);
  return !!d && sha256Hex(d.bytes) === d.sha256;
}

export function voidDocument(id) { h().prepare("UPDATE sign_documents SET voided=1 WHERE id=?").run(String(id)); }

export function setProposalSignPointers(proposalId, { unsignedDocId, signedDocId, signStatus } = {}) {
  const sets = [], args = [];
  if (unsignedDocId !== undefined) { sets.push("unsigned_doc_id=?"); args.push(unsignedDocId); }
  if (signedDocId !== undefined)   { sets.push("signed_doc_id=?");   args.push(signedDocId); }
  if (signStatus !== undefined)    { sets.push("sign_status=?");     args.push(signStatus); }
  if (!sets.length) return;
  h().prepare(`UPDATE proposals SET ${sets.join(", ")} WHERE id=?`).run(...args, Number(proposalId));
}

// Append-only audit event. Never throws into the caller's flow.
export function recordSignEvent({ accessId, proposalId = null, sessionId = null, kind, detail = null, actor = null, ip = null, ua = null }) {
  try {
    h().prepare("INSERT INTO sign_events (project_access_id, proposal_id, session_id, kind, detail, actor, ip, ua) VALUES (?,?,?,?,?,?,?,?)")
      .run(String(accessId), proposalId == null ? null : Number(proposalId), sessionId, String(kind).slice(0, 40),
        detail == null ? null : (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 4000),
        actor ? String(actor).slice(0, 120) : null, ip ? String(ip).slice(0, 80) : null, ua ? String(ua).slice(0, 300) : null);
  } catch { /* the audit write must never break signing */ }
}

export function listSignEvents(proposalId) {
  return h().prepare("SELECT * FROM sign_events WHERE proposal_id=? ORDER BY id ASC").all(Number(proposalId)).map((r) => ({ ...r }));
}
