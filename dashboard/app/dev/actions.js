"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseToken } from "../../lib/auth";
import { toggleDevTask, addDevTask, archiveAndDelete } from "../../lib/db";

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
