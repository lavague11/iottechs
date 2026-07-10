import { redirect } from "next/navigation";
import { getPendingExpenses, getPendingRequests, getPendingWorkOrders, getTickets } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import OperationsClient from "./operations-client";

export default async function OperationsPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts   = getNotifSummary(user.id);
  const expenses = getPendingExpenses().map(r => ({ ...r }));
  const requests = getPendingRequests().map(r => ({ ...r }));
  const workOrders = getPendingWorkOrders().map(r => ({ ...r }));
  const tickets  = getTickets().filter(t => t.status !== "closed").map(r => ({ ...r }));

  return (
    <OperationsClient
      user={user}
      alerts={alerts}
      expenses={expenses}
      requests={requests}
      workOrders={workOrders}
      tickets={tickets}
    />
  );
}
