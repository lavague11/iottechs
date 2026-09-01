"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseToken } from "../../lib/auth";
import { toggleDevTask, addDevTask, archiveAndDelete, setSecret, deleteSecret, dismissKey, restoreKey } from "../../lib/db";

async function requireAdmin() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor?.role === "admin" ? actor : null;
}

export async function toggleDevTaskAction(id, done) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  toggleDevTask(id, done);
  revalidatePath("/dev");
  return { ok: true };
}

export async function addDevTaskAction(fields) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  if (!String(fields?.title || "").trim()) return { error: "Title is required." };
  const { id } = addDevTask(fields);
  revalidatePath("/dev");
  return { ok: true, id };
}

export async function deleteDevTaskAction(id) {
  const actor = await requireAdmin();
  if (!actor) return { error: "Unauthorized." };
  const r = archiveAndDelete("dev_task", id, actor);
  if (!r.ok) return { error: r.error };
  revalidatePath("/dev");
  return { ok: true };
}

// ---- API key vault ----
export async function saveSecretAction(key, value) {
  const actor = await requireAdmin();
  if (!actor) return { error: "Unauthorized." };
  const r = setSecret(key, value, actor.name || actor.email || "admin");
  if (!r.ok) return { error: r.error };
  revalidatePath("/dev");
  return { ok: true };
}

export async function clearSecretAction(key) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  deleteSecret(key);
  revalidatePath("/dev");
  return { ok: true };
}

// Hide a key from the vault list (also drops any stored value). Restorable — registry keys are
// declared in code, so "delete" here means hide, not a permanent removal.
export async function dismissSecretAction(key) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  dismissKey(key);
  revalidatePath("/dev");
  return { ok: true };
}

export async function restoreSecretAction(key) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  restoreKey(key);
  revalidatePath("/dev");
  return { ok: true };
}
