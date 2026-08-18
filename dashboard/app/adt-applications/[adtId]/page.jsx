import { redirect } from "next/navigation";
import { getAdtApplication, decBlob } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import AdtProjectClient from "./adt-project-client";

// Dedicated project page for a single ADT account — full-page, project-style chrome (header + stage
// rail + equipment/contact/schedule sections). Staff only. Opened from the /adt-applications list.
export default async function AdtProjectPage({ params }) {
  const { adtId } = await params;
  const user = await getSessionUser();
  // Deck is open to admin/manager (Admin view) and sales (Rep view). Technicians have no view here.
  if (!user || !["admin", "manager", "sales"].includes(user.role)) redirect("/login");
  const office = ["admin", "manager"].includes(user.role);   // sees SSN/EIN + verbal password

  const app = getAdtApplication(adtId);
  if (!app) redirect("/adt-applications");

  const alerts = getNotifSummary(user.id);
  const a = {
    adt_id: app.adt_id, name: app.name, email: app.email, phone: app.phone, address: app.address,
    equipment: app.equipment || {}, points: app.points, notes: app.notes, stage: app.stage,
    property_type: app.property_type || "residential",
    // Sensitive PII stays with the office — sales never receives SSN/EIN or the verbal password.
    tax_id: office && app.tax_id ? decBlob(app.tax_id) : "",
    emergency: (() => { try { return JSON.parse(app.emergency_contacts || "[]"); } catch { return []; } })(),
    verbal_password: office && app.verbal_password ? decBlob(app.verbal_password) : "",
    schedule_date: app.schedule_date, schedule_window: app.schedule_window, access_pin: app.access_pin,
    pref_days: app.pref_days || [], pref_windows: app.pref_windows || [], deal_json: app.deal_json || "",
    deal_shared: !!app.deal_shared_at, deal_accepted: !!app.deal_accepted_at,
    created_at: app.created_at, scheduled_at: app.scheduled_at, completed_at: app.completed_at,
  };
  return <AdtProjectClient user={user} alerts={alerts} app={a} />;
}
