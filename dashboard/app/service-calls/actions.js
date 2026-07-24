"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { setServiceCallStage, logServiceCallEvent, getServiceCall, assignServiceCallTech, addDiagnostic } from "../../lib/db";

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

// A tech/admin/manager runs the full TRACE diagnostic against the call — same concept as the
// customer's 60-second check, but the technician trees. Logs a mode="tech" diagnostic to the
// same record the customer's writes to, so every check is on one timeline.
export async function runStaffDiagnosticAction(svcId, record) {
  const { user, error } = await requireStaff(["admin", "manager", "tech"]);
  if (error) return { ok: false, error };
  if (!getServiceCall(svcId)) return { ok: false, error: "Service call not found." };
  const steps = Array.isArray(record?.steps) ? record.steps.slice(0, 60) : [];
  const outcome = record?.outcome && typeof record.outcome === "object" ? record.outcome : null;
  addDiagnostic(svcId, {
    mode: "tech",
    technician: user.name,
    issue: String(record?.issue || "").slice(0, 200) || null,
    steps, outcome,
    started: record?.started || null, completed: record?.completed || null,
    actor_role: user.role, actor_name: user.name,
  });
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
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
