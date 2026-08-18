"use server";

import { createAdtApplication } from "../../lib/db";
import { adtSummary } from "../../lib/adt";

// Apply — create the ADT application from the intake form (all info gathered here).
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
    prefDays:    Array.isArray(form?.prefDays) ? form.prefDays : [],
    prefWindows: Array.isArray(form?.prefWindows) ? form.prefWindows : [],
  });
  return { ok: true, adtId: rec.adt_id, pin: rec.access_pin };
}
