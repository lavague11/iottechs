"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { archiveCustomer, archiveAllProjects, createTicket, createLegacyProject, importLegacyClients } from "../../lib/db";

// Add ONE existing/past client as a completed legacy record (not an active inquiry). Admin/manager.
export async function addLegacyClientAction(row) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Only Admin & Manager can add past clients." };
  const res = createLegacyProject({ ...(row || {}), createdByName: user.name });
  if (!res?.ok) return { ok: false, error: res?.error || "Could not add the client." };
  revalidatePath("/customers");
  return { ok: true, accessId: res.accessId, customerPin: res.customerPin };
}

// Bulk-import a pasted/CSV list of past clients as completed legacy records. Admin/manager. Logs one
// audit ticket. Everything is recoverable from Archives (records are created, not destructive).
export async function importLegacyClientsAction(rows) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Only Admin & Manager can import clients." };
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: "Nothing to import." };
  if (rows.length > 2000) return { ok: false, error: "Too many rows at once (max 2000). Split the list and import in batches." };
  const res = importLegacyClients(rows, user.name);
  createTicket({
    subject: `Imported ${res.created} past client${res.created === 1 ? "" : "s"}`,
    priority: "low",
    opened_by_id: user.id, opened_by_name: user.name, opened_by_role: user.role,
    audience: "admin,manager",
    body: `${user.name || "A staff member"} bulk-imported ${res.created} legacy client record(s)${res.skipped ? `, ${res.skipped} row(s) skipped (no name)` : ""}. Each is a completed record, recoverable from Archives.`,
  });
  revalidatePath("/customers");
  return { ok: true, created: res.created, skipped: res.skipped, results: res.results };
}

// Archive one customer (all their projects) — reversible; recoverable from /archives.
// Records a single audit ticket so nothing disappears without a trace.
export async function archiveCustomerAction(customerName) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Only Admin & Manager can archive customers." };
  const res = archiveCustomer(customerName, { id: user.id, name: user.name });
  if (!res.ok) return res;
  createTicket({
    subject: `Archived customer: ${customerName}`,
    priority: "low",
    opened_by_id: user.id, opened_by_name: user.name, opened_by_role: user.role,
    audience: "admin,manager",
    body: `${user.name || "A staff member"} archived customer "${customerName}" (${res.count} project${res.count === 1 ? "" : "s"}). Recoverable from Archives; permanently deletable there.`,
  });
  revalidatePath("/customers");
  revalidatePath("/archives");
  return { ok: true, count: res.count };
}

// Wipe every customer/project into the archive — the "start from scratch" action. Admin only.
// One summary ticket instead of one-per-project, so the audit trail isn't flooded.
export async function wipeAllCustomersAction() {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, error: "Only an Admin can wipe all customers." };
  const res = archiveAllProjects({ id: user.id, name: user.name });
  createTicket({
    subject: `Wiped all customers (${res.count} project${res.count === 1 ? "" : "s"})`,
    priority: "medium",
    opened_by_id: user.id, opened_by_name: user.name, opened_by_role: user.role,
    audience: "admin,manager",
    body: `${user.name || "An admin"} archived ALL ${res.count} project(s) to start from scratch. Everything is recoverable from Archives.`,
  });
  revalidatePath("/customers");
  revalidatePath("/archives");
  return { ok: true, count: res.count };
}
