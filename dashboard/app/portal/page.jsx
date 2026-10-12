import { getAllJobs, getCustomers, getTickets, listServiceCalls } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import PortalClient from "./portal-client";

export default async function PortalPage({ searchParams }) {
  const sp        = await searchParams;
  const user      = await getSessionUser();
  const alerts    = getNotifSummary(user.id);
  const jobs      = getAllJobs();
  const customers = getCustomers();
  // Lightweight rows for cross-entity search (tickets + service calls), grouped in the results.
  const tickets = getTickets().filter((t) => t.status !== "closed").map((t) => ({
    id: t.id, subject: t.subject, customer: t.project_customer || t.opened_by_name || "", status: t.status, priority: t.priority,
  }));
  const serviceCalls = listServiceCalls().map((c) => ({
    id: c.id, customer: c.customer || c.business_name || "", address: c.address || "", status: c.stage, phone: c.phone || "",
  }));
  return <PortalClient user={user} alerts={alerts} jobs={jobs} customers={customers} tickets={tickets} serviceCalls={serviceCalls} initialQ={sp?.q || ""} />;
}
