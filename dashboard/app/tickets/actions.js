"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { getUserById, getTicketById, updateTicket, addTicketMessage, notifyRoles, getUserByEmail, createNotification, deleteTicket } from "../../lib/db";

const STAFF = ["admin", "manager", "sales", "tech"];

async function getActor() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const tok   = token ? await parseToken(token) : null;
  if (!tok?.id) return null;
  const u = getUserById(tok.id);
  return u ? { ...u } : { id: tok.id, role: tok.role };
}

// Notify everyone in the ticket's audience (except the actor) about an update.
function notifyParticipants(ticket, actor, title, body) {
  const link = `/tickets/${ticket.id}`;
  const roles = ticket.audienceList.filter((r) => STAFF.includes(r));
  if (roles.length) notifyRoles(roles, { type: "ticket", title, body, link }, actor.id);
  // Customer participant: the project's contact, if audience allows
  if (ticket.audienceList.includes("customer") && ticket.project_email) {
    const cust = getUserByEmail(ticket.project_email);
    if (cust && Number(cust.id) !== Number(actor.id)) createNotification({ user_id: cust.id, type: "ticket", title, body, link });
  }
}

export async function postMessageAction(ticketId, body) {
  const actor = await getActor();
  if (!actor) return { error: "Unauthorized." };
  if (!String(body || "").trim()) return { error: "Message is empty." };
  const ticket = getTicketById(ticketId);
  if (!ticket) return { error: "Ticket not found." };

  addTicketMessage(ticketId, { author_id: actor.id, author_name: actor.name, author_role: actor.role, body });
  notifyParticipants(ticket, actor, `Reply on: ${ticket.subject}`, `${actor.name || actor.role}: ${String(body).slice(0, 80)}`);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  return { ok: true };
}

export async function updateTicketAction(ticketId, fields) {
  const actor = await getActor();
  if (!actor || !["admin", "manager", "sales", "tech"].includes(actor.role)) return { error: "Unauthorized." };
  // Only admin/manager may change audience (who can see it)
  if (fields.audience !== undefined && !["admin", "manager"].includes(actor.role)) {
    return { error: "Only an admin or manager can change visibility." };
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) return { error: "Ticket not found." };

  updateTicket(ticketId, fields);
  if (fields.status) notifyParticipants(ticket, actor, `Ticket ${fields.status.replace("_", " ")}: ${ticket.subject}`, `Updated by ${actor.name || actor.role}`);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  return { ok: true };
}

// Admin/manager delete a ticket — archived (with its messages) for recovery, not hard-erased.
export async function deleteTicketAction(ticketId) {
  const actor = await getActor();
  if (!actor || !["admin", "manager"].includes(actor.role)) return { error: "Only Admin & Manager can delete tickets." };
  const r = deleteTicket(ticketId, { id: actor.id, name: actor.name });
  if (r?.error) return r;
  revalidatePath("/tickets");
  revalidatePath("/archives");
  return { ok: true };
}
