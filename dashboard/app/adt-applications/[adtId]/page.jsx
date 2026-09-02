import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAdtApplication, getUserById, decBlob, getStaffUsers } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import AdtProjectClient from "./adt-project-client";
import AdtGate from "../../adt/adt-gate";

const digits = (s) => String(s || "").replace(/\D/g, "");

// A non-staff visitor who already holds customer access to THIS account (the owner, or a PIN grant)
// belongs on their own customer view — not the staff Deck. Mirrors the /adt read gate (minus staff).
async function customerHasAccess(rec) {
  const jar = await cookies();
  const accessRaw = jar.get("iot_access")?.value;
  const access = accessRaw ? await parseAccessToken(accessRaw) : null;
  if (access && String(access.accessId) === String(rec.adt_id)) return true;
  const sess = jar.get("iot_session")?.value ? await parseToken(jar.get("iot_session").value) : null;
  if (sess?.role === "customer") {
    const u = sess.id ? getUserById(sess.id) : null;
    const emailOwns = sess.email && rec.email && sess.email.trim().toLowerCase() === rec.email.trim().toLowerCase();
    const phoneOwns = digits(u?.phone).length >= 7 && digits(u?.phone) === digits(rec.phone);
    if (emailOwns || phoneOwns) return true;
  }
  return false;
}

// Dedicated project page for a single ADT account — full-page, project-style chrome (header + stage
// rail + equipment/contact/schedule sections). Staff Deck. Opened from the /adt-applications list, or
// shared as a link — a non-staff visitor can PIN in (same gate as the customer portal).
export default async function AdtProjectPage({ params }) {
  const { adtId } = await params;
  const user = await getSessionUser();
  const isStaff = user && ["admin", "manager", "sales"].includes(user.role);

  // Non-staff visitor: let them PIN in instead of forcing a full login. If they already have customer
  // access (owner / account PIN), send them to THEIR view; otherwise show the account gate. The master
  // admin PIN resolves to a staff session and lands back here on the staff Deck.
  if (!isStaff) {
    const rec = getAdtApplication(adtId);
    if (!rec) redirect("/login");
    if (await customerHasAccess(rec)) redirect(`/adt?id=${adtId}`);
    return <AdtGate adtId={adtId} firstName={String(rec.name || "").trim().split(/\s+/)[0] || ""} />;
  }
  const office = ["admin", "manager"].includes(user.role);   // sees SSN/EIN + verbal password

  const app = getAdtApplication(adtId);
  if (!app) redirect("/adt-applications");

  const alerts = getNotifSummary(user.id);
  const a = {
    adt_id: app.adt_id, name: app.name, email: app.email, phone: app.phone, address: app.address, dob: app.dob || "",
    equipment: app.equipment || {}, points: app.points, notes: app.notes, stage: app.stage,
    property_type: app.property_type || "residential", contact_name: app.contact_name || "", asap: !!app.asap,
    status: app.status || "submitted", docs_note: app.docs_note || "", customer_docs: app.customer_docs || [],
    // Sensitive PII stays with the office — sales never receives SSN/EIN or the verbal password.
    tax_id: office && app.tax_id ? decBlob(app.tax_id) : "",
    emergency: (() => { try { return JSON.parse(app.emergency_contacts || "[]"); } catch { return []; } })(),
    verbal_password: office && app.verbal_password ? decBlob(app.verbal_password) : "",
    schedule_date: app.schedule_date, schedule_window: app.schedule_window, access_pin: app.access_pin,
    pref_days: app.pref_days || [], pref_windows: app.pref_windows || [], deal_json: app.deal_json || "",
    verification_doc: office ? (app.verification_doc || null) : null,
    deal_shared: !!app.deal_shared_at, deal_accepted: !!app.deal_accepted_at,
    deal_signed: !!app.deal_signed_at, deal_signed_name: app.deal_signed_name || "",
    deal_signed_at: app.deal_signed_at || null, deal_signature_data: app.deal_signature_data || null,
    created_at: app.created_at, scheduled_at: app.scheduled_at, completed_at: app.completed_at,
  };
  // Directory for the "Invite members" search in the Schedule modal — everyone, searchable by
  // name / email / phone (same source the project scheduler uses).
  const staffUsers = getStaffUsers().map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role, phone: r.phone }));
  return <AdtProjectClient user={user} alerts={alerts} app={a} staffUsers={staffUsers} />;
}
