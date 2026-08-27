"use server";

import { cookies } from "next/headers";
import { resolveApplicationRef, getApplicationAssessment, saveApplicationAssessment, setApplicationStatus, logApplicationEvent } from "../../../lib/db";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { scoreCore } from "../../../lib/assessment-bank";
import { gradeAssessmentAI } from "../../../lib/assessment-grade";

// The candidate holds an iot_app grant for THIS application; staff (admin/manager) may also act.
async function authApp(appId) {
  const app = resolveApplicationRef(appId);
  if (!app) return { ok: false };
  const user = await getSessionUser();
  if (user?.id && ["admin", "manager"].includes(user.role)) return { ok: true, app, staff: true };
  const jar = await cookies();
  const tok = jar.get("iot_app")?.value;
  const parsed = tok ? await parseSvcToken(tok) : null;
  if (parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase()) return { ok: true, app, staff: false };
  return { ok: false };
}

// Autosave in-progress answers. Once submitted, the assessment is locked.
export async function saveAssessmentProgressAction(appId, responses) {
  const a = await authApp(appId);
  if (!a.ok) return { ok: false, error: "not-authorized" };
  const cur = getApplicationAssessment(a.app.app_id) || {};
  if (cur.status === "submitted" || cur.status === "graded") return { ok: false, error: "locked" };
  saveApplicationAssessment(a.app.app_id, { ...cur, status: "in_progress", responses: responses || {}, started_at: cur.started_at || new Date().toISOString() });
  // Opening the assessment moves the pipeline from Applied → Assessment.
  if (a.app.status === "applied") setApplicationStatus(a.app.app_id, "assessment", { actor_role: "system", actor_name: "Assessment" });
  return { ok: true };
}

// Submit + auto-score (answer selection + behavioral + auto-flags). Explanation points and
// explanation-content flags are added by the separate AI grading pass.
export async function submitAssessmentAction(appId, responses) {
  const a = await authApp(appId);
  if (!a.ok) return { ok: false, error: "not-authorized" };
  const cur = getApplicationAssessment(a.app.app_id) || {};
  if (cur.status === "submitted" || cur.status === "graded") return { ok: false, error: "locked" };
  const core = scoreCore(responses || {});
  saveApplicationAssessment(a.app.app_id, {
    ...cur, status: "submitted", responses: responses || {},
    answerPoints: core.answerPoints, behavioralPoints: core.behavioralPoints, autoScore: core.autoScore,
    cats: core.cats, autoFlags: core.autoFlags,
    submitted_at: new Date().toISOString(), started_at: cur.started_at || new Date().toISOString(),
  });
  if (["applied", "assessment"].includes(a.app.status)) setApplicationStatus(a.app.app_id, "assessment", { actor_role: "system", actor_name: "Assessment" });
  try { logApplicationEvent(a.app.app_id, { kind: "note", detail: `Assessment submitted — auto-score ${core.autoScore}/80 (explanations pending)`, actor_role: "system", actor_name: "Assessment" }); } catch {}
  // Best-effort AI grading of the explanations + profile — never blocks the candidate's submit.
  try { await gradeAssessmentAI(a.app.app_id); } catch {}
  return { ok: true };
}

// ── Retake requests ────────────────────────────────────────────────────────
// A candidate whose exam is in (submitted/graded) can ask to retake it — with a reason. It does
// NOT reopen the exam; an admin must approve. Stored inside the assessment blob (no new column).
export async function requestRetakeAction(appId, reason) {
  const a = await authApp(appId);
  if (!a.ok) return { ok: false, error: "not-authorized" };
  const cur = getApplicationAssessment(a.app.app_id) || {};
  if (!["submitted", "graded"].includes(cur.status)) return { ok: false, error: "You can only request a retake after submitting." };
  if (cur.retake?.status === "pending") return { ok: false, error: "You already have a retake request awaiting review." };
  const why = String(reason || "").trim();
  if (why.length < 10) return { ok: false, error: "Please tell us why you'd like to retake it (a sentence or two)." };
  saveApplicationAssessment(a.app.app_id, { ...cur, retake: { status: "pending", reason: why.slice(0, 600), requested_at: new Date().toISOString() } });
  try { logApplicationEvent(a.app.app_id, { kind: "note", detail: `Retake requested by applicant — "${why.slice(0, 120)}"`, actor_role: "applicant", actor_name: a.app.name || "Applicant" }); } catch {}
  return { ok: true };
}

// Office decision on a retake request — admin/manager only. Approving archives the current attempt
// (never destroyed — audit) and reopens the exam for a fresh attempt.
export async function decideRetakeAction(appId, approve, note) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return { ok: false, error: "forbidden" };
  const app = resolveApplicationRef(appId); if (!app) return { ok: false, error: "not-found" };
  const cur = getApplicationAssessment(app.app_id) || {};
  if (cur.retake?.status !== "pending") return { ok: false, error: "No pending retake request." };
  const decided = { by: user.name, at: new Date().toISOString(), note: String(note || "").slice(0, 300) };

  if (!approve) {
    saveApplicationAssessment(app.app_id, { ...cur, retake: { ...cur.retake, status: "denied", ...decided } });
    try { logApplicationEvent(app.app_id, { kind: "note", detail: "Retake request declined", actor_role: user.role, actor_name: user.name }); } catch {}
    return { ok: true, status: "denied" };
  }

  // Approve: snapshot the finished attempt, then reopen a clean exam. Prior attempts are preserved.
  const { retake, attempts = [], ...finished } = cur;
  const snapshot = { ...finished, archived_at: new Date().toISOString() };
  saveApplicationAssessment(app.app_id, {
    attempts: [...attempts, snapshot],
    status: "in_progress", responses: {}, started_at: null,
    retake: { ...cur.retake, status: "approved", ...decided },
  });
  // If the pipeline had moved past Assessment on the strength of the old score, pull it back.
  if (["applied", "assessment"].includes(app.status || "")) setApplicationStatus(app.app_id, "assessment", { actor_role: user.role, actor_name: user.name });
  try { logApplicationEvent(app.app_id, { kind: "note", detail: `Retake approved — exam reopened (attempt ${attempts.length + 2})`, actor_role: user.role, actor_name: user.name }); } catch {}
  return { ok: true, status: "approved" };
}

// Office-triggered (re)grade — admin/manager only.
export async function gradeAssessmentAction(appId) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return { ok: false, error: "forbidden" };
  const r = await gradeAssessmentAI(appId, { actor_role: user.role, actor_name: user.name });
  return r;
}
