import { redirect } from "next/navigation";
import { getPendingExpenses, getPendingRequests, getPendingWorkOrders, getTickets, getStalledJobs, getAllJobs, getReceivables, listServiceCalls } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { svcIsOpen } from "../../lib/svc-status";
import { buildActionItems, ACTION_CATEGORIES } from "../../lib/action-center";
import OperationsClient from "./operations-client";

export default async function OperationsPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts   = getNotifSummary(user.id);
  const expenses = getPendingExpenses().map(r => ({ ...r }));
  const requests = getPendingRequests().map(r => ({ ...r }));
  const workOrders = getPendingWorkOrders().map(r => ({ ...r }));
  const tickets  = getTickets().filter(t => t.status !== "closed").map(r => ({ ...r }));
  const stalled  = getStalledJobs();

  // The canonical action queue — same source the dashboard's Needs Attention shows a slice of.
  const ac = buildActionItems({
    jobs: getAllJobs(),
    receivables: getReceivables(),
    tickets: tickets.filter(t => t.status !== "resolved"),
    serviceCalls: listServiceCalls().filter(c => svcIsOpen(c.stage)),
    pendingWorkOrders: workOrders, pendingExpenses: expenses, pendingRequests: requests,
  });
  const actionQueue = ACTION_CATEGORIES
    .map(c => ({ ...c, items: ac.byCategory[c.key].map(x => ({ ...x })) }))
    .filter(c => c.items.length);

  return (
    <OperationsClient
      user={user}
      alerts={alerts}
      expenses={expenses}
      requests={requests}
      workOrders={workOrders}
      tickets={tickets}
      stalled={stalled}
      actionQueue={actionQueue}
      actionCount={ac.count}
    />
  );
}
