"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { archiveProject, createTicket, mergeProjects, duplicateProject, setReceivableArchived, getJobByAccessId, getProjectsForCustomerId } from "../../lib/db";

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

// Hide a project from active lists (reversible timestamp — nothing moved or deleted). Admin/manager.
export async function setProjectArchivedAction(accessId, on) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Only Admin & Manager can archive projects." };
  const changed = setReceivableArchived(accessId, on !== false);
  revalidatePath("/projects"); revalidatePath("/dashboard");
  return changed ? { ok: true, access_id: accessId, archived: on !== false } : { ok: false, error: "Project not found." };
}

// Delete a project — admin only, two-step confirm at the UI. Non-destructive: it moves to /archives
// (recoverable), exactly like archiveProject, but gated tighter and framed as a delete.
export async function deleteProjectAction(accessId) {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, error: "Only an Admin can delete a project." };
  const res = archiveProject(accessId, { id: user.id, name: user.name });
  if (!res.ok) return res;
  createTicket({
    subject: `Deleted project: ${res.access_id}`, priority: "low",
    opened_by_id: user.id, opened_by_name: user.name, opened_by_role: user.role, audience: "admin,manager",
    body: `${user.name || "An admin"} deleted project ${res.access_id}${res.customer ? ` (${res.customer})` : ""}. Recoverable from Archives.`,
  });
  revalidatePath("/projects"); revalidatePath("/dashboard"); revalidatePath("/archives");
  return { ok: true, access_id: res.access_id };
}

// Duplicate a project for the same customer (new draft proposal). Admin/manager/sales.
export async function duplicateProjectAction(accessId) {
  const user = await getSessionUser();
  if (!["admin", "manager", "sales"].includes(user.role)) return { ok: false, error: "Not allowed." };
  const res = duplicateProject(accessId, { id: user.id, name: user.name });
  if (!res.ok) return res;
  revalidatePath("/projects"); revalidatePath("/dashboard");
  return res;
}

// The other projects this one could merge into — same customer, not itself, not already archived.
// Admin/manager only (merge is their action). Returns a compact list for the picker.
export async function listMergeCandidatesAction(accessId) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Not allowed." };
  const p = getJobByAccessId(accessId);
  if (!p?.customer_id) return { ok: true, candidates: [] };
  const rows = (getProjectsForCustomerId(p.customer_id) || [])
    .filter((r) => r.access_id !== p.access_id)
    .map((r) => ({ access_id: r.access_id, customer: r.customer, address: r.address || "", stage: r.stage, stageLabel: r.stageLabel || r.stage }));
  return { ok: true, candidates: rows };
}

// Merge two projects for the same customer/address → the OLDER one survives; proposals (both kept),
// notes, files and log move onto it; the other is archived. Admin/manager only; irreversible-feeling,
// so the UI confirms first. Logs the merge on the survivor.
export async function mergeProjectsAction(aAccessId, bAccessId) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Only Admin & Manager can merge projects." };
  const res = mergeProjects(aAccessId, bAccessId, { id: user.id, name: user.name });
  if (!res.ok) return res;
  createTicket({
    subject: `Merged ${res.merged} → ${res.survivor}`, priority: "low",
    opened_by_id: user.id, opened_by_name: user.name, opened_by_role: user.role, audience: "admin,manager",
    body: `${user.name || "A staff member"} merged project ${res.merged} into ${res.survivor} (kept the older ID). Moved ${res.moved.proposals} proposal version(s), ${res.moved.notes} note(s), ${res.moved.files} file(s). The merged shell is recoverable from Archives.`,
  });
  revalidatePath("/projects"); revalidatePath("/dashboard"); revalidatePath(`/project/${res.survivor}`);
  return res;
}
