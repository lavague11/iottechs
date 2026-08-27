"use server";

import { cookies } from "next/headers";
import { resolveApplicationRef, getApplication, getApplicationCompliance, setComplianceItem, setComplianceCheck, setApplicationStatus, logApplicationEvent, encBlob } from "../../../lib/db";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { complianceProgress } from "../../../lib/hiring";

async function authApp(appId) {
  const app = resolveApplicationRef(appId);
  if (!app) return { ok: false };
  const user = await getSessionUser();
  if (user?.id && ["admin", "manager"].includes(user.role)) return { ok: true, app, staff: true, name: user.name, role: user.role };
  const jar = await cookies();
  const tok = jar.get("iot_app")?.value;
  const parsed = tok ? await parseSvcToken(tok) : null;
  if (parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase()) return { ok: true, app, staff: false, name: app.name };
  return { ok: false };
}
const digits = (s) => String(s || "").replace(/\D/g, "");
const last4 = (s) => digits(s).slice(-4);

// After a candidate submits/updates any item, bump the pipeline to Compliance Review once everything's in.
function maybeAdvance(app, actor) {
  const prog = complianceProgress(getApplicationCompliance(app.app_id));
  if (prog.allSubmitted && app.status === "documents_pending") setApplicationStatus(app.app_id, "compliance_review", actor);
}

// ── Candidate submissions ────────────────────────────────────────────────
export async function saveComplianceFormAction(appId, key, data) {
  const a = await authApp(appId); if (!a.ok) return { ok: false, error: "not-authorized" };
  setComplianceItem(a.app.app_id, key, { status: "submitted", data: data || {} }, { actor_role: "applicant", actor_name: a.name });
  maybeAdvance(a.app, { actor_role: "system", actor_name: "Compliance" });
  return { ok: true };
}
export async function signComplianceAction(appId, key, name) {
  const a = await authApp(appId); if (!a.ok) return { ok: false, error: "not-authorized" };
  if (String(name || "").trim().length < 2) return { ok: false, error: "Type your full name to sign." };
  setComplianceItem(a.app.app_id, key, { status: "submitted", signed_name: String(name).trim().slice(0, 80), signed_at: new Date().toISOString() }, { actor_role: "applicant", actor_name: a.name });
  maybeAdvance(a.app, { actor_role: "system", actor_name: "Compliance" });
  return { ok: true };
}
export async function saveW9Action(appId, { legal_name, business_name, address, tin, tin_type, signed_name }) {
  const a = await authApp(appId); if (!a.ok) return { ok: false, error: "not-authorized" };
  const t = digits(tin);
  if (t.length < 9) return { ok: false, error: "Enter a valid 9-digit SSN or EIN." };
  if (String(signed_name || "").trim().length < 2) return { ok: false, error: "Type your name to certify the W-9." };
  setComplianceItem(a.app.app_id, "w9", {
    status: "submitted",
    data: { legal_name: String(legal_name || "").slice(0, 120), business_name: String(business_name || "").slice(0, 120), address: String(address || "").slice(0, 200), tin_type: tin_type === "ein" ? "ein" : "ssn" },
    tin_enc: encBlob(t), tin_last4: last4(t), signed_name: String(signed_name).trim().slice(0, 80), signed_at: new Date().toISOString(),
  }, { actor_role: "applicant", actor_name: a.name });
  maybeAdvance(a.app, { actor_role: "system", actor_name: "Compliance" });
  return { ok: true };
}
export async function saveDepositAction(appId, { bank_name, routing, account, account_type }) {
  const a = await authApp(appId); if (!a.ok) return { ok: false, error: "not-authorized" };
  const acct = digits(account), rt = digits(routing);
  if (rt.length !== 9) return { ok: false, error: "Routing number must be 9 digits." };
  if (acct.length < 4) return { ok: false, error: "Enter a valid account number." };
  setComplianceItem(a.app.app_id, "direct_deposit", {
    status: "submitted",
    data: { bank_name: String(bank_name || "").slice(0, 120), routing: rt, account_type: account_type === "savings" ? "savings" : "checking" },
    account_enc: encBlob(acct), account_last4: last4(acct),
  }, { actor_role: "applicant", actor_name: a.name });
  maybeAdvance(a.app, { actor_role: "system", actor_name: "Compliance" });
  return { ok: true };
}
// Record an uploaded doc (image already stored via /api/media). `refs` = [{part, id, url}], plus optional expires.
export async function recordComplianceUploadAction(appId, key, refs, expires_at) {
  const a = await authApp(appId); if (!a.ok) return { ok: false, error: "not-authorized" };
  setComplianceItem(a.app.app_id, key, { status: "submitted", refs: Array.isArray(refs) ? refs.slice(0, 4) : [], expires_at: expires_at || null }, { actor_role: "applicant", actor_name: a.name });
  maybeAdvance(a.app, { actor_role: "system", actor_name: "Compliance" });
  return { ok: true };
}

// ── Office review ────────────────────────────────────────────────────────
export async function verifyComplianceAction(appId, key, verified, reason) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return { ok: false, error: "forbidden" };
  setComplianceItem(appId, key, verified ? { status: "verified", verified_by: user.name, reject_reason: null } : { status: "rejected", reject_reason: String(reason || "").slice(0, 300) }, { actor_role: user.role, actor_name: user.name });
  return { ok: true };
}
export async function setComplianceCheckAction(appId, key, status, note) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return { ok: false, error: "forbidden" };
  setComplianceCheck(appId, key, { status, note: String(note || "").slice(0, 300), by: user.name }, { actor_role: user.role, actor_name: user.name });
  // Move to Background Pending while checks are outstanding.
  const app = getApplication(appId);
  if (status === "pending" && app?.status === "compliance_review") setApplicationStatus(appId, "background_pending", { actor_role: user.role, actor_name: user.name });
  return { ok: true };
}
export async function clearForTrainingAction(appId) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return { ok: false, error: "forbidden" };
  const prog = complianceProgress(getApplicationCompliance(appId));
  if (!prog.allVerified) return { ok: false, error: "Verify every document first." };
  setApplicationStatus(appId, "cleared", { actor_role: user.role, actor_name: user.name });
  logApplicationEvent(appId, { kind: "note", detail: "Cleared for Training", actor_role: user.role, actor_name: user.name });
  return { ok: true };
}
