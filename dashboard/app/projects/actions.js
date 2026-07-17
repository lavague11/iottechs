"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { archiveProject, createTicket } from "../../lib/db";

// Archive ONE project (soft/recoverable → /archives). Admin/manager only. Records an audit ticket
// so a single job never disappears without a trace, matching the customer-archive flow.
export async function archiveProjectAction(accessId) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Only Admin & Manager can archive projects." };
  const res = archiveProject(accessId, { id: user.id, name: user.name });
  if (!res.ok) return res;
  createTicket({
    subject: `Archived project: ${res.access_id}`,
    priority: "low",
    opened_by_id: user.id, opened_by_name: user.name, opened_by_role: user.role,
    audience: "admin,manager",
    body: `${user.name || "A staff member"} archived project ${res.access_id}${res.customer ? ` (${res.customer})` : ""}. Recoverable from Archives; permanently deletable there.`,
  });
  revalidatePath("/projects");
  revalidatePath("/archives");
  return { ok: true, access_id: res.access_id };
}
