import { redirect } from "next/navigation";
import { listApplications, stageEnteredMap } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { nextAction, effectiveDisposition, STAGE_SLA_DAYS } from "../../lib/hiring";
import HiringBoard from "./hiring-client";

// The technician hiring pipeline board — every candidate across the three portals. Admin/manager
// only (hiring is not a tech function). Each row carries the same triage signals as the detail page:
// deterministic Next Action, owner, disposition, and days-in-stage / overdue.
export default async function HiringPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const since = stageEnteredMap();
  const rows = listApplications().map((a) => {
    const na = a.portal === 1 ? nextAction(a) : null;   // the next-action rules are Portal-1 focused
    const eff = effectiveDisposition(a);
    const enteredAt = since[String(a.app_id).toUpperCase()] || a.created_at;
    const days = enteredAt ? Math.floor((Date.now() - Date.parse(String(enteredAt).replace(" ", "T"))) / 86400000) : null;
    const sla = STAGE_SLA_DAYS[a.status] ?? null;
    const overdue = a.status !== "declined" && a.portal === 1 && days != null && sla != null && days > sla;
    return {
      app_id: a.app_id, name: a.name, position_label: a.position_label,
      portal: a.portal, status: a.status, status_label: a.status_label, status_tone: a.status_tone,
      rating: a.rating, created_at: a.created_at,
      owner_id: a.owner_id || null, owner_name: a.owner_name || null,
      disp_key: eff.key, disp_label: eff.label, disp_tone: eff.tone,
      next_label: na?.label || null,
      days_in_stage: days, overdue,
    };
  });

  return <HiringBoard user={user} alerts={alerts} rows={rows} />;
}
