"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { archiveCustomer, archiveAllProjects, createTicket } from "../../lib/db";

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
