"use server";

import { cookies } from "next/headers";
import { createAdtApplication, acceptAdtDeal, getAdtApplication } from "../../lib/db";
import { adtSummary } from "../../lib/adt";
import { makeAccessToken, accessTtlFor } from "../../lib/auth";

// Unlock an ADT account with its access PIN (last 4 of the phone) — mirrors the project PIN gate.
// Mints the same iot_access grant so the customer survives reloads/navigation.
export async function unlockAdtAction(adtId, pin) {
  const app = getAdtApplication(adtId);
  if (!app) return { error: "Application not found." };
  const clean = String(pin || "").replace(/\D/g, "");
  if (!app.access_pin || clean !== String(app.access_pin)) return { error: "That PIN doesn't match." };
  const jar = await cookies();
  jar.set("iot_access", await makeAccessToken(app.adt_id, "customer"), { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.ceil(accessTtlFor("customer") / 1000) });
  return { ok: true };
}

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
    verificationDoc: form?.verificationDoc && form.verificationDoc.data ? form.verificationDoc : null,
  });
  return { ok: true, adtId: rec.adt_id, pin: rec.access_pin };
}

// Quote — the customer accepts ("picks up") the quote staff shared with them.
export async function acceptAdtQuoteAction(adtId) {
  const app = getAdtApplication(adtId);
  if (!app) return { error: "Application not found." };
  if (!app.deal_shared_at) return { error: "No quote to accept yet." };
  acceptAdtDeal(adtId);
  return { ok: true };
}
