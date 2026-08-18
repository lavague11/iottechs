import { redirect } from "next/navigation";
import { listAdtApplications } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import AdtApplicationsClient from "./adt-applications-client";

// Office view for ADT (24/7 Monitoring) applications — the Apply→Schedule→Complete intakes from
// the /adt portal. Staff only.
export default async function AdtApplicationsPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/login");

  const alerts = getNotifSummary(user.id);
  const apps = listAdtApplications().map((a) => ({
    adt_id: a.adt_id, name: a.name, email: a.email, phone: a.phone, address: a.address,
    equipment: a.equipment || {}, points: a.points, notes: a.notes, stage: a.stage,
    property_type: a.property_type || "residential",
    schedule_date: a.schedule_date, schedule_window: a.schedule_window, access_pin: a.access_pin,
    created_at: a.created_at, scheduled_at: a.scheduled_at, completed_at: a.completed_at,
  }));
  return <AdtApplicationsClient user={user} alerts={alerts} apps={apps} />;
}
