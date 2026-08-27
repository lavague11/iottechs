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

// Office-triggered (re)grade — admin/manager only.
export async function gradeAssessmentAction(appId) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return { ok: false, error: "forbidden" };
  const r = await gradeAssessmentAI(appId, { actor_role: user.role, actor_name: user.name });
  return r;
}
