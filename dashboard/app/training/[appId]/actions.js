"use server";

import { cookies } from "next/headers";
import { resolveApplicationRef, getApplication, getApplicationTraining, setTrainingModule, setTraining, setApplicationStatus, logApplicationEvent } from "../../../lib/db";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { nextP3Status, FIELD_JOBS_REQUIRED, TRAINING_MODULES } from "../../../lib/hiring";

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
async function requireStaff() {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return null;
  return user;
}

// ── Trainee ──────────────────────────────────────────────────────────────
// Acknowledge a knowledge module (read + confirm understanding).
export async function acknowledgeModuleAction(appId, key) {
  const a = await authApp(appId); if (!a.ok) return { ok: false, error: "not-authorized" };
  const mod = TRAINING_MODULES.find((m) => m.key === key);
  if (!mod || mod.type === "field") return { ok: false, error: "not-acknowledgeable" };
  setTrainingModule(a.app.app_id, key, { status: "done", acknowledged_by: a.name }, { actor_role: a.staff ? a.role : "trainee", actor_name: a.name });
  return { ok: true };
}

// ── Office ───────────────────────────────────────────────────────────────
// Start the training program: cleared → new_hire (enter Portal 3).
export async function startTrainingAction(appId) {
  const user = await requireStaff(); if (!user) return { ok: false, error: "forbidden" };
  const app = getApplication(appId);
  if (app?.status !== "cleared") return { ok: false, error: "Not cleared for training yet." };
  setApplicationStatus(appId, "new_hire", { actor_role: user.role, actor_name: user.name });
  logApplicationEvent(appId, { kind: "note", detail: "Started training program", actor_role: user.role, actor_name: user.name });
  return { ok: true, status: "new_hire" };
}
// Advance the progression: new_hire → onboarding → training → supervised → final_cert.
export async function advanceTrainingAction(appId) {
  const user = await requireStaff(); if (!user) return { ok: false, error: "forbidden" };
  const app = getApplication(appId);
  const next = nextP3Status(app?.status || "new_hire");
  if (next === app?.status || next === "approved") return { ok: false, error: "Use Approve to finish." };
  setApplicationStatus(appId, next, { actor_role: user.role, actor_name: user.name });
  return { ok: true, status: next };
}
// Sign off one supervised field job.
export async function signFieldJobAction(appId, note) {
  const user = await requireStaff(); if (!user) return { ok: false, error: "forbidden" };
  const t = getApplicationTraining(appId);
  const count = (t.modules?.field_training?.count || 0) + 1;
  setTrainingModule(appId, "field_training", { status: count >= FIELD_JOBS_REQUIRED ? "done" : "in_progress", count, last_note: String(note || "").slice(0, 200), signed_by: user.name }, { actor_role: user.role, actor_name: user.name });
  return { ok: true, count };
}
// Grant/adjust certification tier + qualification badges.
export async function setCertAction(appId, { tier, badges }) {
  const user = await requireStaff(); if (!user) return { ok: false, error: "forbidden" };
  const patch = {};
  if (tier !== undefined) patch.tier = tier || null;
  if (Array.isArray(badges)) patch.badges = badges;
  setTraining(appId, patch, { actor_role: user.role, actor_name: user.name });
  return { ok: true };
}
// Final certification → Approved Technician (terminal). Sets the tier and status.
export async function approveTechnicianAction(appId, tier = "technician") {
  const user = await requireStaff(); if (!user) return { ok: false, error: "forbidden" };
  setTraining(appId, { tier, certified_at: new Date().toISOString() }, { actor_role: user.role, actor_name: user.name });
  setApplicationStatus(appId, "approved", { actor_role: user.role, actor_name: user.name });
  logApplicationEvent(appId, { kind: "note", detail: `Approved Technician (${tier})`, actor_role: user.role, actor_name: user.name });
  return { ok: true, status: "approved" };
}
