import { redirect } from "next/navigation";
import { listServiceCalls } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ServiceCallsClient from "./service-calls-client";

// Service Calls portal — the focused list of every service call (SVC entity), separate from the
// project pipeline. Staff only; a tech sees the board too. Detail/gateway comes next.
export default async function ServiceCallsPage({ searchParams }) {
  const user = await getSessionUser();
  if (!["admin", "manager", "tech"].includes(user.role)) redirect("/login");

  const sp     = await searchParams;
  const alerts = getNotifSummary(user.id);
  const calls  = listServiceCalls().map((c) => ({
    svc_id: c.svc_id, customer: c.customer, address: c.address, issue: c.issue,
    category: c.category, stage: c.stage, stage_label: c.stage_label,
    priority: c.priority, assignee_name: c.assignee_name, created_at: c.created_at,
    outcome_route: c.outcome_route,
    // Linked to one of OUR projects = a repair on a system we installed; unlinked = a new site or
    // someone else's system = a new-install opportunity to route to sales.
    project_access_id: c.project_access_id || null,
  }));
  return <ServiceCallsClient user={user} alerts={alerts} calls={calls} initialFilter={sp?.filter || "open"} />;
}
