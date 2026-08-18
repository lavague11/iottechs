"use server";

import { createAdtApplication, scheduleAdtApplication, completeAdtApplication, getAdtApplication, setAdtPreferences } from "../../lib/db";
import { adtSummary } from "../../lib/adt";

// Step 1 — Apply: create the ADT application from the intake form.
export async function submitAdtApplicationAction(form) {
  const name  = String(form?.name || "").trim();
  const phone = String(form?.phone || "").trim();
  if (!name)  return { error: "Please enter your name." };
  if (!phone) return { error: "Please enter a phone number." };
  const { points } = adtSummary(form?.equipment || {});
  if (points <= 0 && !Object.values(form?.equipment || {}).some((q) => +q > 0)) {
    return { error: "Add at least one piece of equipment." };
  }
  const rec = createAdtApplication({
    name, phone,
    email:     String(form?.email || "").trim(),
    address:   String(form?.address || "").trim(),
    equipment: form?.equipment || {},
    points,
    notes:     String(form?.notes || "").trim(),
    propertyType: form?.propertyType === "commercial" ? "commercial" : "residential",
    taxId:     String(form?.taxId || "").trim(),
    emergency: Array.isArray(form?.emergency) ? form.emergency : [],
    verbalPassword: String(form?.verbalPassword || "").trim(),
  });
  return { ok: true, adtId: rec.adt_id, pin: rec.access_pin };
}

// Step 2 — Schedule (staff, firm date).
export async function scheduleAdtAction(adtId, { date, window } = {}) {
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  if (!date) return { error: "Please choose an install date." };
  scheduleAdtApplication(adtId, { date, window });
  return { ok: true };
}

// Step 2 — Customer preferred times (days + windows, not a firm date).
export async function submitAdtPreferencesAction(adtId, { days, windows } = {}) {
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  const d = Array.isArray(days) ? days : [];
  const w = Array.isArray(windows) ? windows : [];
  if (!d.length) return { error: "Pick at least one preferred day." };
  if (!w.length) return { error: "Pick at least one time window." };
  setAdtPreferences(adtId, { days: d, windows: w });
  return { ok: true };
}

// Step 3 — Complete (office / installer marks the job done).
export async function completeAdtAction(adtId) {
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  completeAdtApplication(adtId);
  return { ok: true };
}
