"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { setServiceCallStage, logServiceCallEvent, getServiceCall, assignServiceCallTech } from "../../lib/db";

async function requireStaff(roles = ["admin", "manager", "tech"]) {
  const user = await getSessionUser();
  if (!roles.includes(user.role)) return { user: null, error: "Not authorized." };
  return { user, error: null };
}

export async function setSvcStageAction(svcId, stage) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const r = setServiceCallStage(svcId, stage, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not update stage." };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath("/service-calls");
  return { ok: true, call: r };
}

export async function addSvcNoteAction(svcId, body) {
  const { user, error } = await requireStaff();
  if (error) return { ok: false, error };
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "Note is empty." };
  if (!getServiceCall(svcId)) return { ok: false, error: "Service call not found." };
  logServiceCallEvent(svcId, { kind: "note", detail: text, actor_role: user.role, actor_name: user.name });
  revalidatePath(`/service-calls/${svcId}`);
  return { ok: true };
}

export async function assignSvcTechAction(svcId, techId, techName) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const r = assignServiceCallTech(svcId, techId ? Number(techId) : null, techName || null, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not assign." };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath("/service-calls");
  return { ok: true, call: r };
}
