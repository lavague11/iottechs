import { getAllJobs, getCustomers } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import PortalClient from "./portal-client";

export default async function PortalPage({ searchParams }) {
  const sp        = await searchParams;
  const user      = await getSessionUser();
  const alerts    = getNotifSummary(user.id);
  const jobs      = getAllJobs();
  const customers = getCustomers();
  return <PortalClient user={user} alerts={alerts} jobs={jobs} customers={customers} initialQ={sp?.q || ""} />;
}
