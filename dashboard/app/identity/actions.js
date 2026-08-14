"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { setIdentityStatus, deleteUserIdentity, createEnrollInvite, logIdentityEvent, claimUnauthorizedFace, dismissUnauthorizedFace } from "../../lib/db";

async function requireManager() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { user: null, error: "Not authorized." };
  return { user, error: null };
}

// Verify / set-pending / reject an enrollment. Admin or manager.
export async function setIdentityStatusAction(userId, status) {
  const { user, error } = await requireManager();
  if (error) return { ok: false, error };
  const r = setIdentityStatus(userId, status, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not update." };
  revalidatePath("/identity");
  return { ok: true, status: r.status };
}

// Mint a one-time enrollment link for a user (admin/manager). They open it and
// enroll without logging in first.
export async function createEnrollInviteAction(userId) {
  const { user, error } = await requireManager();
  if (error) return { ok: false, error };
  const inv = createEnrollInvite(userId, { createdBy: user.name });
  if (!inv) return { ok: false, error: "Pick a person to invite." };
  logIdentityEvent(userId, { kind: "invite", detail: "Enrollment link created", actor_role: user.role, actor_name: user.name });
  return { ok: true, token: inv.token, expires_at: inv.expires_at };
}

// Attach an unauthorized capture to a user as an additional face (multi-face). Admin/manager.
export async function claimUnauthorizedAction(captureId, userId) {
  const { user, error } = await requireManager();
  if (error) return { ok: false, error };
  if (!userId) return { ok: false, error: "Pick a person." };
  const r = claimUnauthorizedFace(Number(captureId), Number(userId), user.name);
  if (!r?.ok) return { ok: false, error: r?.error || "Couldn't attach." };
  revalidatePath("/identity");
  return { ok: true, name: r.name };
}

// Dismiss an unauthorized capture (not one of ours / junk). Admin/manager.
export async function dismissUnauthorizedAction(captureId) {
  const { user, error } = await requireManager();
  if (error) return { ok: false, error };
  dismissUnauthorizedFace(Number(captureId));
  revalidatePath("/identity");
  return { ok: true };
}

// Purge a user's biometrics entirely. Destructive — admin only.
export async function deleteIdentityAction(userId) {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, error: "Only an admin can delete biometrics." };
  deleteUserIdentity(userId, { actor_role: user.role, actor_name: user.name });
  revalidatePath("/identity");
  return { ok: true };
}
