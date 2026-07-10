import { notFound, redirect } from "next/navigation";
import { getTicketById, getAllUsers } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import TicketDetailClient from "./ticket-detail-client";

export default async function TicketDetailPage({ params }) {
  const { id } = await params;
  const user   = await getSessionUser();
  const alerts = getNotifSummary(user.id);

  const ticket = getTicketById(id);
  if (!ticket) notFound();

  const canView = ["admin", "manager"].includes(user.role)
    || ticket.audienceList.includes(user.role)
    || ticket.assignee_id === user.id
    || ticket.opened_by_id === user.id;
  if (!canView) redirect("/tickets");

  const staff = getAllUsers()
    .filter((u) => ["admin", "manager", "sales", "tech"].includes(u.role) && !u.disabled)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return <TicketDetailClient user={user} alerts={alerts} ticket={ticket} staff={staff} />;
}
