import { getTickets } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import TicketsClient from "./tickets-client";

export default async function TicketsPage() {
  const user   = await getSessionUser();
  const alerts = getNotifSummary(user.id);

  let tickets = getTickets();
  // Admin & manager see everything; other staff see only tickets whose audience includes their role.
  if (!["admin", "manager"].includes(user.role)) {
    tickets = tickets.filter((t) => t.audienceList.includes(user.role) || t.assignee_id === user.id || t.opened_by_id === user.id);
  }

  const slim = tickets.map((t) => ({
    id: t.id, subject: t.subject, status: t.status, priority: t.priority,
    customer: t.project_customer || t.opened_by_name || "—", access_id: t.access_id,
    opened_by_name: t.opened_by_name, opened_by_role: t.opened_by_role,
    assignee_name: t.assignee_name, audienceList: t.audienceList,
    message_count: t.message_count, updated_at: t.updated_at,
  }));

  return <TicketsClient user={user} alerts={alerts} tickets={slim} />;
}
