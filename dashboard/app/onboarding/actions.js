"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import {
  getApplication, setApplicationStage, setApplicationReview, setApplicationOnboarding,
  hireApplicant, logApplicationEvent,
} from "../../lib/db";

// Hiring is an admin/manager function — a tech must never review or advance applications.
async function requireHiring() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { user: null, error: "Not authorized." };
  return { user, error: null };
}

function touch(appId) {
  revalidatePath("/onboarding");
  revalidatePath(`/onboarding/${appId}`);
  revalidatePath(`/application/${appId}`);
}

export async function setAppStageAction(appId, stage, reason) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const r = setApplicationStage(appId, stage, { actor_role: user.role, actor_name: user.name, reason });
  if (!r) return { ok: false, error: "Could not update." };
  touch(appId);
  return { ok: true, app: r };
}

export async function setAppReviewAction(appId, patch) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const r = setApplicationReview(appId, patch || {}, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not update." };
  touch(appId);
  return { ok: true, app: r };
}

export async function addAppNoteAction(appId, body) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "Note is empty." };
  if (!getApplication(appId)) return { ok: false, error: "Application not found." };
  logApplicationEvent(appId, { kind: "note", detail: text, actor_role: user.role, actor_name: user.name });
  touch(appId);
  return { ok: true };
}

export async function setAppOnboardingAction(appId, patch) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const r = setApplicationOnboarding(appId, patch || {}, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not update." };
  touch(appId);
  return { ok: true, app: r };
}

// Hiring creates a real staff account — admin only (a manager can move stages but not mint logins).
export async function hireApplicantAction(appId, role) {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, error: "Only an admin can create the staff account." };
  const r = hireApplicant(appId, role, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not hire." };
  touch(appId);
  revalidatePath("/users");
  // The stage moved either way — but say so plainly when the login couldn't be created.
  return { ok: true, app: r.app, warning: r.accountError || null };
}
