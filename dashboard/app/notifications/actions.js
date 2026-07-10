"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { markAllRead, markNotificationRead, deleteNotification, clearNotifications } from "../../lib/db";

async function getActorId() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const tok   = token ? await parseToken(token) : null;
  return tok?.id || null;
}

export async function markAllReadAction() {
  const id = await getActorId();
  if (!id) return { error: "Unauthorized." };
  markAllRead(id);
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markReadAction(notifId) {
  const id = await getActorId();
  if (!id) return { error: "Unauthorized." };
  markNotificationRead(notifId, id);
  revalidatePath("/notifications");
  return { ok: true };
}

export async function dismissNotificationAction(notifId) {
  const id = await getActorId();
  if (!id) return { error: "Unauthorized." };
  deleteNotification(notifId, id);
  revalidatePath("/notifications");
  return { ok: true };
}

export async function clearAllNotificationsAction() {
  const id = await getActorId();
  if (!id) return { error: "Unauthorized." };
  clearNotifications(id);
  revalidatePath("/notifications");
  return { ok: true };
}
