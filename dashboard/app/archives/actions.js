"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseToken } from "../../lib/auth";
import { restoreArchive, purgeArchive, purgeAllArchives } from "../../lib/db";

async function requireAdmin() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor?.role === "admin" ? actor : null;
}

// Map each archived entity back to the page that should refresh on restore.
const REVALIDATE = {
  expense:   ["/expenses", "/finances"],
  user:      ["/users"],
  inventory: ["/inventory"],
  dev_task:  ["/dev"],
};

export async function restoreArchiveAction(id) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  const r = restoreArchive(id);
  if (!r.ok) return { error: r.error };
  (REVALIDATE[r.entityType] || []).forEach((p) => revalidatePath(p));
  revalidatePath("/archives");
  return { ok: true };
}

export async function purgeArchiveAction(id) {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  purgeArchive(id);
  revalidatePath("/archives");
  return { ok: true };
}

export async function purgeAllArchivesAction() {
  if (!(await requireAdmin())) return { error: "Unauthorized." };
  const r = purgeAllArchives();
  revalidatePath("/archives");
  return { ok: true, count: r.count };
}
