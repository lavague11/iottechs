// The signing session: a random, expiring token layered ON TOP of the PIN / login grant — never a
// replacement for it. The token is stored hashed, bound to proposal + version + document sha256 + the
// content fingerprint, and re-validated server-side on EVERY step:
//   caller still owns the project · still the same signer · session open + unexpired · the proposal is
//   still the same active, unsigned version with an unchanged fingerprint · the stored PDF still hashes
//   to what the signer was shown. Nothing the client sends (fingerprint, flattened PDF, ids) is trusted.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sqliteHandle, getActiveProposal } from "../db.js";
import { getDocumentInfo, documentIntact, recordSignEvent, setProposalSignPointers, newId } from "./store.js";
import { maySignProposal } from "./access.js";
import { ensureProposalUnsigned, proposalFingerprintOf, signBlocker } from "./proposal-source.js";
import { mergeValues } from "./capture.js";

export const SESSION_TTL_MS = 30 * 60 * 1000;
const h = () => sqliteHandle();
const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const fail = (code, error) => ({ ok: false, code, error });
const MSG = {
  DENIED: "You can't sign this proposal.",
  NO_SESSION: "This signing session isn't valid. Reopen the document.",
  EXPIRED: "This signing session expired. Reopen the document to continue.",
  VOID: "This signing session was cancelled because the proposal changed. Reopen it to review the update.",
  USED: "This document was already signed.",
  CHANGED: "The proposal changed since you opened it. Reopen it to review the update.",
  TAMPERED: "The document failed its integrity check.",
};

export const publicSession = (s) => ({ id: s.id, expiresAt: s.expires_at, state: s.state, optionKey: s.option_key, version: s.version });

function rowBy(tokenHash) { return h().prepare("SELECT * FROM sign_sessions WHERE token_hash=?").get(tokenHash) || null; }
const parseValues = (s) => { try { return s.values_json ? JSON.parse(s.values_json) : {}; } catch { return {}; } };

// Same signer as the one who opened it: identity comes from the caller's cookies, not the request body.
function sameSigner(s, caller) {
  if (!caller || caller.role !== s.signer_role) return false;
  if (s.via_pin) return !!caller.viaPin && String(caller.accessId) === String(s.project_access_id);
  return !caller.viaPin && caller.id != null && Number(caller.id) === Number(s.signer_user_id);
}

// Validate a token for one step. `accessId` comes from the page the caller is on; it must match the
// session's project. Returns { ok, session, row, doc, values } or { ok:false, code, error }.
export function validateSession(token, accessId, caller, { now = Date.now() } = {}) {
  if (!token || typeof token !== "string" || token.length < 20) return fail("NO_SESSION", MSG.NO_SESSION);
  const s = rowBy(hashToken(token));
  if (!s || !same(s.token_hash, hashToken(token))) return fail("NO_SESSION", MSG.NO_SESSION);
  if (String(s.project_access_id).toLowerCase() !== String(accessId || "").toLowerCase()) return fail("DENIED", MSG.DENIED);
  // Ownership is re-checked on every step against the CURRENT cookies — a leaked token alone is useless.
  if (!maySignProposal(caller, s.project_access_id) || !sameSigner(s, caller)) return fail("DENIED", MSG.DENIED);
  if (s.state === "signed") return fail("USED", MSG.USED);
  if (s.state === "completing") return fail("BUSY", "This document is being signed.");
  if (s.state === "void") return fail("VOID", MSG.VOID);
  if (s.state === "expired" || Number(s.expires_at) <= now) {
    if (s.state === "open") h().prepare("UPDATE sign_sessions SET state='expired' WHERE id=? AND state='open'").run(s.id);
    return fail("EXPIRED", MSG.EXPIRED);
  }
  const row = getActiveProposal(s.project_access_id);
  if (!row || row.id !== s.proposal_id || row.version !== s.version) return fail("VOID", MSG.VOID);
  if (row.signed_name) return fail("USED", MSG.USED);
  if (signBlocker(row, s.option_key)) return fail("CHANGED", MSG.CHANGED);
  if (proposalFingerprintOf(row) !== s.fingerprint) return fail("CHANGED", MSG.CHANGED);
  const doc = getDocumentInfo(s.doc_id);
  if (!doc || doc.voided || doc.sha256 !== s.doc_sha256 || doc.proposal_id !== row.id) return fail("CHANGED", MSG.CHANGED);
  if (!documentIntact(s.doc_id)) return fail("TAMPERED", MSG.TAMPERED);
  return { ok: true, session: s, row, doc, values: parseValues(s) };
}

// Open (or resume) a signing session for one option. `resumeToken` lets a reload pick the same session up.
export function startSession({ accessId, optKey, caller, resumeToken = null, ip = null, ua = null, now = Date.now() }) {
  if (!maySignProposal(caller, accessId)) return fail("DENIED", MSG.DENIED);
  if (resumeToken) {
    const v = validateSession(resumeToken, accessId, caller, { now });
    if (v.ok && v.session.option_key === optKey) {
      h().prepare("UPDATE sign_sessions SET expires_at=? WHERE id=?").run(now + SESSION_TTL_MS, v.session.id);
      return { ok: true, token: resumeToken, session: publicSession({ ...v.session, expires_at: now + SESSION_TTL_MS }), doc: v.doc, values: v.values, row: v.row, resumed: true };
    }
  }
  const r = ensureProposalUnsigned(accessId, optKey, { by: caller.role });
  if (r.error) return fail("NOT_SIGNABLE", r.error);
  const { row, doc, fingerprint } = r;
  // One live session per signer + proposal: a fresh open replaces any earlier one.
  const viaPin = caller.viaPin ? 1 : 0;
  h().prepare("UPDATE sign_sessions SET state='void', void_reason='replaced' WHERE proposal_id=? AND state='open' AND signer_role=? AND via_pin=? AND COALESCE(signer_user_id,0)=COALESCE(?,0)")
    .run(row.id, caller.role, viaPin, caller.id ?? null);
  const token = randomBytes(24).toString("base64url");
  const id = newId(12);
  h().prepare(`INSERT INTO sign_sessions (id, token_hash, proposal_id, project_access_id, version, option_key, doc_id, doc_sha256, fingerprint,
      signer_role, signer_user_id, signer_email, via_pin, expires_at, ip, ua) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, hashToken(token), row.id, row.project_access_id, row.version, optKey, doc.id, doc.sha256, fingerprint,
      caller.role, caller.id ?? null, caller.email ? String(caller.email).toLowerCase() : null, viaPin, now + SESSION_TTL_MS, ip, ua ? String(ua).slice(0, 300) : null);
  if (!row.sign_status) setProposalSignPointers(row.id, { signStatus: "viewed" });
  recordSignEvent({ accessId: row.project_access_id, proposalId: row.id, sessionId: id, kind: "opened", actor: caller.role, ip, ua,
    detail: { version: row.version, option: optKey, docSha256: doc.sha256 } });
  const s = rowBy(hashToken(token));
  return { ok: true, token, session: publicSession(s), doc, values: {}, row };
}

// Store a validated patch (name / signature / acks) on the session. Sliding expiry.
export function saveValues({ token, accessId, caller, patch, ip = null, ua = null, now = Date.now() }) {
  const v = validateSession(token, accessId, caller, { now });
  if (!v.ok) return v;
  const merged = mergeValues(v.values, patch, new Date(now));
  if (merged.error) return fail("BAD_VALUE", merged.error);
  h().prepare("UPDATE sign_sessions SET values_json=?, expires_at=? WHERE id=?").run(JSON.stringify(merged.values), now + SESSION_TTL_MS, v.session.id);
  if (v.row.sign_status !== "signing") setProposalSignPointers(v.row.id, { signStatus: "signing" });
  for (const k of ["name", "signature", "acks"]) {
    if (patch?.[k] !== undefined) recordSignEvent({ accessId: v.session.project_access_id, proposalId: v.row.id, sessionId: v.session.id, kind: `set_${k}`, actor: caller.role, ip, ua,
      detail: k === "signature" ? { method: patch.signature.method } : k === "acks" ? merged.values.acks : null });
  }
  return { ok: true, values: merged.values, expiresAt: now + SESSION_TTL_MS, row: v.row, doc: v.doc, session: v.session };
}

// Void every open session on a proposal (a revision minted v+1, or the office voided the signature).
// Plain SQL on purpose: db.js calls the same statement inline from reviseProposal (no import cycle).
export function voidSessionsForProposal(proposalId, reason = "revised") {
  h().prepare("UPDATE sign_sessions SET state='void', void_reason=? WHERE proposal_id=? AND state='open'").run(reason, Number(proposalId));
}
