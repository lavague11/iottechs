"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseToken } from "../../lib/auth";
import { finalizePcp } from "../../lib/db";

async function requireStaff() {
  const jar = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor && ["admin", "manager"].includes(actor.role) ? actor : null;
}

// Admin/manager finalizes or adjusts a PCP credit from the ledger — status + grant source.
export async function setPcpAction(accessId, patch) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  const row = finalizePcp(accessId, patch || {});
  if (!row) return { error: "No proposal." };
  revalidatePath("/pcp");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}
