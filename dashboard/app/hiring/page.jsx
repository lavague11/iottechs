import { redirect } from "next/navigation";
import { listApplications } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import HiringBoard from "./hiring-client";

// The technician hiring pipeline board — every candidate across the three portals. Admin/manager
// only (hiring is not a tech function).
export default async function HiringPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows = listApplications().map((a) => ({
    app_id: a.app_id, name: a.name, position_label: a.position_label,
    portal: a.portal, status: a.status, status_label: a.status_label, status_tone: a.status_tone,
    rating: a.rating, reviewer_name: a.reviewer_name, interview_at: a.interview_at, created_at: a.created_at,
  }));

  return <HiringBoard user={user} alerts={alerts} rows={rows} />;
}
