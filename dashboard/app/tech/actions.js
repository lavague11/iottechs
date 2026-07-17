"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseToken } from "../../lib/auth";
import { createFieldProject } from "../../lib/db";

async function getActor() {
  const jar = await cookies();
  const token = jar.get("iot_session")?.value;
  return token ? await parseToken(token) : null;
}

// Field capture: a technician (or office staff) logs a legacy/on-site job from just a name + address.
// The project lands flagged "missing details" so the office fills in the rest later.
export async function createFieldProjectAction({ name, address } = {}) {
  const actor = await getActor();
  if (!actor || !["tech", "admin", "manager"].includes(actor.role)) return { error: "Unauthorized." };
  if (!String(name || "").trim()) return { error: "Customer name is required." };

  const res = createFieldProject({ name, address, createdByName: actor.name || actor.role });
  if (res?.error) return { error: res.error };
  revalidatePath("/tech");
  revalidatePath("/dashboard");
  return { ok: true, accessId: res.accessId };
}
