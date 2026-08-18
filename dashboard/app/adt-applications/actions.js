"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { scheduleAdtApplication, completeAdtApplication, getAdtApplication, saveAdtDeal, shareAdtDeal, setAdtStatus } from "../../lib/db";

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
