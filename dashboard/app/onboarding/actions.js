"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import {
  getApplication, setApplicationStage, setApplicationReview, setApplicationOnboarding,
  hireApplicant, logApplicationEvent, verifyEmergencyContact,
  setApplicationStatus, saveApplicationStep, setApplicationArchived, setApplicationDisposition, setApplicationOwner,
} from "../../lib/db";
import { nextP1Status, STEP_RUBRICS, stageComplete, stageRequirements, dispositionLabel } from "../../lib/hiring";

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

// Void / restore an application. Admin-only (stronger than a stage change) and non-destructive —
// the row + its event history are kept; it's just hidden from the board.
export async function setAppArchivedAction(appId, archived) {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, error: "Only an admin can void an application." };
  const r = setApplicationArchived(appId, !!archived, { actor_role: user.role, actor_name: user.name });
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

// Office marks the emergency contact confirmed (they called it). Admin/manager.
export async function verifyEmergencyAction(appId, verified, note) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const r = verifyEmergencyContact(appId, !!verified, { actor_role: user.role, actor_name: user.name, note });
  if (!r) return { ok: false, error: "Could not update." };
  touch(appId);
  return { ok: true };
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

// ── Portal 1 evaluation scorecards + decision ─────────────────────────────
// Save one step's scorecard: ratings {criterion: 1-5}, notes, recommendation (advance|hold|decline).
export async function saveHiringStepAction(appId, step, { ratings = {}, notes = "", recommendation = "" }) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  if (!STEP_RUBRICS[step]) return { ok: false, error: "Unknown step." };
  const vals = Object.values(ratings).map(Number).filter((n) => n >= 1 && n <= 5);
  const score = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  saveApplicationStep(appId, step, { ratings, notes: String(notes || "").slice(0, 1000), recommendation, score }, { actor_role: user.role, actor_name: user.name });
  touch(appId);
  return { ok: true, score };
}

// Advance the candidate to the next Portal 1 status (assessment → phone → … → final_review).
export async function advanceHiringAction(appId, { override = false, reason = "" } = {}) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const app = getApplication(appId);
  if (!app) return { ok: false, error: "Not found." };
  // A paused/withdrawn candidate can't advance — set them back to Active first.
  if ((app.disposition || "active") !== "active") return { ok: false, error: `Candidate is ${dispositionLabel(app.disposition)} — set them Active to continue.` };
  const cur = app.status || "applied";
  const next = nextP1Status(cur);
  if (next === cur) return { ok: false, error: "Already at final review." };
  // Gate on the current stage's completion criteria. Incomplete → the UI asks for an override reason.
  const ctx = { assessment: app.assessment, steps: app.steps };
  if (!stageComplete(cur, ctx)) {
    if (!override) {
      const missing = stageRequirements(cur, ctx).filter((r) => !r.optional && !r.done).map((r) => r.label);
      return { ok: false, error: "incomplete", missing };
    }
    const why = String(reason || "").trim();
    if (why.length < 3) return { ok: false, error: "A reason is required to advance past an incomplete stage." };
    logApplicationEvent(appId, { kind: "override", detail: `Advanced past incomplete ${cur} — override: ${why.slice(0, 200)}`, actor_role: user.role, actor_name: user.name });
  }
  setApplicationStatus(appId, next, { actor_role: user.role, actor_name: user.name });
  touch(appId);
  return { ok: true, status: next };
}

// Assign the operational owner (recruiter) of a candidate. owner: {id, name} or null to unassign.
export async function setOwnerAction(appId, owner) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const r = setApplicationOwner(appId, { owner_id: owner?.id || null, owner_name: owner?.name || null }, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not set owner." };
  touch(appId);
  return { ok: true };
}

// Set candidate disposition (active | on_hold | withdrawn) — preserves the pipeline stage.
export async function setDispositionAction(appId, disposition, reason) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  const r = setApplicationDisposition(appId, disposition, { actor_role: user.role, actor_name: user.name, reason });
  if (!r) return { ok: false, error: "Could not update disposition." };
  touch(appId);
  return { ok: true, disposition };
}

// Final-review decision: hire | conditional | decline.
export async function hiringDecisionAction(appId, decision, { role = "tech", notes = "" } = {}) {
  const { user, error } = await requireHiring();
  if (error) return { ok: false, error };
  if (decision === "decline") {
    setApplicationStatus(appId, "declined", { actor_role: user.role, actor_name: user.name, reason: notes });
    logApplicationEvent(appId, { kind: "declined", detail: `Not selected${notes ? ` — ${notes}` : ""}`, actor_role: user.role, actor_name: user.name });
    touch(appId);
    return { ok: true, status: "declined" };
  }
  // hire / conditional → create the staff account, then enter Portal 2 (Compliance).
  if (user.role !== "admin") return { ok: false, error: "Only an admin can create the staff account." };
  const r = hireApplicant(appId, role, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not hire." };
  setApplicationStatus(appId, "documents_pending", { actor_role: user.role, actor_name: user.name });
  logApplicationEvent(appId, { kind: "hired", detail: `${decision === "conditional" ? "Conditional hire" : "Hired"} — into Compliance${notes ? ` · ${notes}` : ""}`, actor_role: user.role, actor_name: user.name });
  touch(appId);
  revalidatePath("/users");
  return { ok: true, status: "documents_pending", conditional: decision === "conditional", warning: r.accountError || null };
}
