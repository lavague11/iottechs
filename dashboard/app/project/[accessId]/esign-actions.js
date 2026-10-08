"use server";

// Server actions for the PDF-first proposal signer (lib/esign/). Every action re-derives the caller from
// the cookies and re-validates the signing session (ownership, signer, expiry, version, fingerprint,
// document hash) — the client's props, ids and fingerprints are display-only and never trusted.
import { headers } from "next/headers";
import { callerFromCookies } from "../../../lib/esign/access";
import { startSession, saveValues, publicSession } from "../../../lib/esign/session";
import { requiredAcks, missingRequired } from "../../../lib/esign/capture";
import { completeSession } from "../../../lib/esign/complete";
import { sanitizeProposal } from "../../../lib/proposal";

async function ctx() {
  const h = await headers();
  const fwd = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  return { caller: await callerFromCookies(h.get("cookie")), ip: fwd || h.get("x-real-ip") || null, ua: h.get("user-agent") || null };
}

// Public view of a stored document — never the bytes (those come through the gated /api/proposal-doc/[id]).
const docView = (d) => ({ id: d.id, sha256: d.sha256, version: d.version, fileName: d.meta?.fileName || null, pageCount: d.meta?.pageCount || 0, fields: d.meta?.fields || [], option: d.meta?.option || null });
const payloadOf = (row) => { try { return JSON.parse(row.payload || "{}"); } catch { return {}; } };
// What the client may keep of the captured values (it already holds them; nothing here is secret from the signer).
const valuesView = (v, row) => ({ name: v?.name || null, signature: v?.signature ? { method: v.signature.method, data: v.signature.data } : null, acks: v?.acks || {}, missing: missingRequired(v, payloadOf(row)) });
const ackList = (row) => requiredAcks(payloadOf(row)).map((a) => ({ key: a.key, required: !!a.required }));
const err = (r) => ({ error: r.error || "Couldn't sign.", code: r.code });

// Open (or resume, with `resumeToken`) a signing session for one option. Generates + stores the unsigned
// PDF the first time (or when the content changed); returns the token, document and any saved values.
export async function startSignAction(accessId, optKey, resumeToken = null) {
  const { caller, ip, ua } = await ctx();
  if (!caller) return { error: "Session expired — unlock the project again to sign.", code: "DENIED" };
  let r;
  try { r = startSession({ accessId, optKey: String(optKey || ""), caller, resumeToken, ip, ua }); }
  catch (e) { return { error: "Couldn't prepare the document.", code: "ERROR" }; }
  if (!r.ok) return err(r);
  return { ok: true, token: r.token, session: publicSession(r.session), doc: docView(r.doc), values: valuesView(r.values, r.row), acks: ackList(r.row), resumed: !!r.resumed };
}

// Save the signer's name / adopted signature / acknowledgments on the session (validated server-side).
export async function saveSignValuesAction(accessId, token, patch) {
  const { caller, ip, ua } = await ctx();
  if (!caller) return { error: "Session expired — unlock the project again to sign.", code: "DENIED" };
  const r = saveValues({ token, accessId, caller, patch: patch || {}, ip, ua });
  if (!r.ok) return err(r);
  return { ok: true, values: valuesView(r.values, r.row), expiresAt: r.expiresAt };
}

// Finish: flatten the signed PDF, run the existing accept + sign lifecycle, write the certificate.
// `acks` (optional) is merged first so the consent sheet can confirm and sign in one round trip.
export async function completeSignAction(accessId, token, acks = null) {
  const { caller, ip, ua } = await ctx();
  if (!caller) return { error: "Session expired — unlock the project again to sign.", code: "DENIED" };
  if (acks) { const r = saveValues({ token, accessId, caller, patch: { acks }, ip, ua }); if (!r.ok) return err(r); }
  const r = await completeSession({ token, accessId, caller, ip, ua });
  if (!r.ok) return err(r);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, stage: r.stage, proposal: sanitizeProposal(r.row, caller.role), signedDocId: r.signedDocId };
}
