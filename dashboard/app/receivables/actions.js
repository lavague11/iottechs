"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { setReceivableArchived } from "../../lib/db";

// Archive / restore a receivable — admin & manager only (it moves money off the active AR view).
export async function archiveReceivableAction(accessId, on) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Not authorized." };
  if (!accessId) return { ok: false, error: "Missing project." };
  const changed = setReceivableArchived(accessId, !!on);
  if (!changed) return { ok: false, error: "Project not found." };
  revalidatePath("/receivables");
  return { ok: true };
}
