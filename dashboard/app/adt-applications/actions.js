"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { scheduleAdtApplication, completeAdtApplication, getAdtApplication, saveAdtDeal, shareAdtDeal, reviseAdtDeal, setAdtStatus, updateAdtApplication, setAdtDocsNote } from "../../lib/db";
import { adtSummary } from "../../lib/adt";

// The ADT project Deck is open to every internal role that has a view — admin/manager (Admin view)
// and sales (Rep view). Technicians are excluded: they do their own thing, no view here.
async function requireStaff() {
  const u = await getSessionUser();
  return u && ["admin", "manager", "sales"].includes(u.role) ? u : null;
}
// Scheduling + completion stay with admin/manager (sales prices the deal, office runs the calendar).
async function requireOffice() {
  const u = await getSessionUser();
  return u && ["admin", "manager"].includes(u.role) ? u : null;
}

// "Lock" from the staff Deck's role menu. Staff reach the Deck through a global session, so a real
// lock means ending this browser's access — clear the session AND any account PIN grant. The next
// person then hits the account gate (page.jsx) and must PIN back in.
export async function lockAdtStaffAction() {
  const jar = await cookies();
  jar.delete("iot_session");
  jar.delete("iot_access");
  return { ok: true };
}

// Which documents the office needs (paired with the needs_docs status).
export async function setAdtDocsNoteAction(adtId, note) {
  if (!(await requireStaff())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  setAdtDocsNote(adtId, note);
  revalidatePath("/adt-applications");
  return { ok: true };
}

// Admin edits a submitted application (contact, equipment, SSN/EIN, emergency, verbal pw, prefs).
export async function updateAdtApplicationAction(adtId, form) {
  if (!(await requireOffice())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  const name = String(form?.name || "").trim();
  const phone = String(form?.phone || "").trim();
  if (!name) return { error: "Please enter a name." };
  if (!phone) return { error: "Please enter a phone number." };
  const { points } = adtSummary(form?.equipment || {});
  updateAdtApplication(adtId, {
    name, phone,
    email: String(form?.email || "").trim(),
    address: String(form?.address || "").trim(),
    equipment: form?.equipment || {}, points,
    notes: String(form?.notes || "").trim(),
    propertyType: form?.propertyType === "commercial" ? "commercial" : "residential",
    taxId: String(form?.taxId || "").trim(),
    emergency: Array.isArray(form?.emergency) ? form.emergency : [],
    verbalPassword: String(form?.verbalPassword || "").trim(),
    prefDays: Array.isArray(form?.prefDays) ? form.prefDays : [],
    prefWindows: Array.isArray(form?.prefWindows) ? form.prefWindows : [],
    asap: !!form?.asap,
    contactName: String(form?.contactName || "").trim(),
    verificationDoc: form?.verificationDoc,   // object=replace · null=remove · undefined=leave as-is
  });
  revalidatePath("/adt-applications");
  return { ok: true };
}

// Office schedules an install date on behalf of the customer.
export async function adminScheduleAdtAction(adtId, { date, window } = {}) {
  if (!(await requireOffice())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  if (!date) return { error: "Pick an install date." };
  scheduleAdtApplication(adtId, { date, window });
  revalidatePath("/adt-applications");
  return { ok: true };
}

// Office marks the install complete.
export async function adminCompleteAdtAction(adtId) {
  if (!(await requireOffice())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  completeAdtApplication(adtId);
  revalidatePath("/adt-applications");
  return { ok: true };
}

// Set the application's credit/approval status (Submitted → In review → Approved | Declined).
export async function setAdtStatusAction(adtId, status) {
  if (!(await requireStaff())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  if (!setAdtStatus(adtId, status)) return { error: "Invalid status." };
  revalidatePath("/adt-applications");
  return { ok: true };
}

// Autosave the ADT Tool deal state (equipment cart, tier, credit, rep). Any staff role that can open
// the Deck can price — the deal is scoped to this one application. Deal is stored raw JSON.
export async function saveAdtDealAction(adtId, deal) {
  if (!(await requireStaff())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  saveAdtDeal(adtId, deal || {});
  return { ok: true };
}

// Share (or unshare) the quote with the customer — flips whether /adt shows their sanitized pricing.
export async function shareAdtDealAction(adtId, on) {
  if (!(await requireStaff())) return { error: "Not authorized." };
  const app = getAdtApplication(adtId);
  if (!app) return { error: "Application not found." };
  if (on && !app.deal_json) return { error: "Price the deal before sharing it." };
  shareAdtDeal(adtId, !!on);
  revalidatePath("/adt-applications");
  return { ok: true, shared: !!on };
}

// Revise an already accepted/signed quote — pulls it back to an editable draft and clears the
// customer's acceptance + signature (the terms are changing, so the old signature no longer stands).
// Office-only, since it voids a signed agreement.
export async function reviseAdtDealAction(adtId) {
  if (!(await requireOffice())) return { error: "Not authorized." };
  const app = getAdtApplication(adtId);
  if (!app) return { error: "Application not found." };
  reviseAdtDeal(adtId);
  revalidatePath("/adt-applications");
  return { ok: true };
}
