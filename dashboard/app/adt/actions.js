"use server";

import { cookies } from "next/headers";
import { createAdtApplication, acceptAdtDeal, signAdtDeal, getAdtApplication, verifyUserByCredential, getPrimaryAdmin, getUserById, addAdtCustomerDoc, removeAdtCustomerDoc } from "../../lib/db";
import { adtSummary } from "../../lib/adt";
import { makeAccessToken, accessTtlFor, makeToken, parseToken, parseAccessToken } from "../../lib/auth";

const STAFF = new Set(["admin", "manager", "sales", "tech"]);
const digits = (s) => String(s || "").replace(/\D/g, "");

// May the current visitor act on this ADT account? Staff, a valid PIN grant for THIS account, or the
// signed-in owner (email/phone match) — mirrors the read gate in app/adt/page.jsx.
async function canAccessAdt(rec) {
  const jar = await cookies();
  const sess = jar.get("iot_session")?.value ? await parseToken(jar.get("iot_session").value) : null;
  if (sess && STAFF.has(sess.role)) return true;
  const accessRaw = jar.get("iot_access")?.value;
  const access = accessRaw ? await parseAccessToken(accessRaw) : null;
  if (access && String(access.accessId) === String(rec.adt_id)) return true;
  if (sess?.role === "customer") {
    const u = sess.id ? getUserById(sess.id) : null;
    const emailOwns = sess.email && rec.email && sess.email.trim().toLowerCase() === rec.email.trim().toLowerCase();
    const phoneOwns = digits(u?.phone).length >= 7 && digits(u?.phone) === digits(rec.phone);
    if (emailOwns || phoneOwns) return true;
  }
  return false;
}

// Customer uploads a requested document (needs-docs). Guarded to the account owner / PIN holder.
export async function uploadAdtDocAction(adtId, doc) {
  const rec = getAdtApplication(adtId);
  if (!rec) return { error: "Application not found." };
  if (!(await canAccessAdt(rec))) return { error: "Not authorized." };
  if (!doc || !doc.data) return { error: "No file to upload." };
  addAdtCustomerDoc(adtId, doc);
  return { ok: true };
}

export async function removeAdtDocAction(adtId, idx) {
  const rec = getAdtApplication(adtId);
  if (!rec) return { error: "Application not found." };
  if (!(await canAccessAdt(rec))) return { error: "Not authorized." };
  removeAdtCustomerDoc(adtId, Number(idx));
  return { ok: true };
}

// Master admin PIN — unlocks any account (same as the project gate). Defaults to 8965; override in prod.
const ADMIN_MASTER_PIN = String(process.env.ADMIN_MASTER_PIN || "8965").trim();

// Resolve access to an ADT account through the shared secure-access gateway. Same contract the project
// gate uses (attemptAccess): a PIN (last 4 of the phone, or the master admin PIN), or email/phone +
// password (a full customer login — the ADT page then authorizes the owner by email/phone match).
// Face ID is handled globally by the gateway (/api/face-login), so it isn't a case here.
export async function adtAttemptAccessAction(adtId, { loginRole, pinValue, emailOrPhone, password } = {}) {
  const app = getAdtApplication(adtId);
  if (!app) return { ok: false, error: "Application not found." };
  const jar = await cookies();

  // Email / phone + password → a real cross-app session (same as the /login page).
  if (emailOrPhone != null && password != null) {
    const user = verifyUserByCredential(emailOrPhone, password);
    if (user?.disabled) return { ok: false, error: "This account has been disabled." };
    if (!user) return { ok: false, error: "Invalid email / phone or password." };
    jar.set("iot_session", await makeToken(user), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
    jar.delete("iot_access");
    return { ok: true, view: user.role || "customer", via: "login", name: user.name };
  }

  if (pinValue != null && pinValue !== "") {
    const entered = String(pinValue).trim();
    const clean = entered.replace(/\D/g, "");

    // Master admin PIN → a real admin session (bound to the primary admin), same as the project gate.
    // This is what lets "Admin view" from the customer Deck land on the staff Deck (which needs a
    // session, not a scoped grant). Falls back to a scoped admin grant if there's no admin account yet.
    if (ADMIN_MASTER_PIN && entered === ADMIN_MASTER_PIN) {
      const admin = getPrimaryAdmin();
      if (admin) {
        jar.set("iot_session", await makeToken(admin), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
        jar.delete("iot_access");
        return { ok: true, view: "admin", via: "pin", name: admin.name };
      }
      jar.set("iot_access", await makeAccessToken(app.adt_id, "admin"), { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.ceil(accessTtlFor("admin") / 1000) });
      return { ok: true, view: "admin", via: "pin" };
    }

    // Account access PIN (last 4 of the phone) → a scoped iot_access grant for THIS account.
    if (app.access_pin && clean === String(app.access_pin)) {
      jar.set("iot_access", await makeAccessToken(app.adt_id, "customer"), { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.ceil(accessTtlFor("customer") / 1000) });
      return { ok: true, view: "customer", via: "pin" };
    }

    return { ok: false, error: "That PIN doesn't match." };
  }

  return { ok: false, error: "Enter your PIN." };
}

// Lock the account — drop the PIN grant so the next visitor must re-enter it (project parity).
export async function lockAdtAction(adtId) {
  const jar = await cookies();
  const raw = jar.get("iot_access")?.value;
  if (raw) {
    const { parseAccessToken } = await import("../../lib/auth");
    const grant = await parseAccessToken(raw);
    if (grant && String(grant.accessId) === String(adtId)) jar.delete("iot_access");
  }
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
    asap:        !!form?.asap,
    contactName: String(form?.contactName || "").trim(),
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

// Quote — the customer SIGNS the quote (the required step to move forward). Same signature contract as
// the proposal: a typed full name + rasterized PNG. Signing records the agreement AND accepts the deal.
export async function signAdtQuoteAction(adtId, sig) {
  const app = getAdtApplication(adtId);
  if (!app) return { error: "Application not found." };
  if (!(await canAccessAdt(app))) return { error: "Not authorized." };
  if (!app.deal_shared_at) return { error: "No quote to sign yet." };
  const name = String(sig?.name || "").trim();
  if (name.length < 2) return { error: "Please enter your full name to sign." };
  if (!sig?.data) return { error: "A signature is required." };
  signAdtDeal(adtId, { name, data: sig.data });
  return { ok: true };
}
