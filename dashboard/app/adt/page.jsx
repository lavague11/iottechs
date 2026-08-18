import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../lib/auth";
import { getAdtApplication, getUserById, getProjectsByContactEmail, decBlob } from "../../lib/db";
import { custDealFromDeal } from "../../lib/adt";

// Mask a tax id to its last 4 for the customer-facing view (full value never leaves the server here).
const maskTax = (digits, comm) => { const d = String(digits || "").replace(/\D/g, ""); if (d.length !== 9) return ""; return comm ? `••-•••${d.slice(5)}` : `•••-••-${d.slice(5)}`; };
import AdtPortalClient from "./adt-portal-client";
import AdtGate from "./adt-gate";

export const metadata = { title: "ADT Project Portal · IOT TECHS" };

const STAFF = new Set(["admin", "manager", "sales", "tech"]);
const digits = (s) => String(s || "").replace(/\D/g, "");

// Decide whether this visitor may open an existing ADT account. Mirrors the project access model:
// staff, the logged-in owner (email/phone match), or a valid iot_access PIN grant for THIS account.
async function canView(rec) {
  const jar = await cookies();
  const session = jar.get("iot_session")?.value ? await parseToken(jar.get("iot_session").value) : null;
  if (session && STAFF.has(session.role)) return true;
  const accessRaw = jar.get("iot_access")?.value;
  const access = accessRaw ? await parseAccessToken(accessRaw) : null;
  if (access && String(access.accessId) === String(rec.adt_id)) return true;   // PIN grant
  if (session?.role === "customer") {
    const u = session.id ? getUserById(session.id) : null;
    const emailOwns = session.email && rec.email && session.email.trim().toLowerCase() === rec.email.trim().toLowerCase();
    const phoneOwns = digits(u?.phone).length >= 7 && digits(u?.phone) === digits(rec.phone);
    if (emailOwns || phoneOwns) return true;
  }
  return false;
}

// The ADT portal: Apply → Quote → Complete. Fresh visit (no ?id) shows the intake form. An existing
// account (?id=ADT0001) is PIN-locked — a visitor must be staff, the owner, or enter the access PIN.
export default async function AdtPage({ searchParams }) {
  const sp  = await searchParams;
  const rec = sp?.id ? getAdtApplication(sp.id) : null;

  // Locked: existing account + unauthorized visitor → PIN gate (no account data leaves the server).
  if (rec && !(await canView(rec))) {
    return <AdtGate adtId={rec.adt_id} firstName={String(rec.name || "").trim().split(/\s+/)[0] || ""} />;
  }

  const app = rec ? {
    adt_id: rec.adt_id, name: rec.name, address: rec.address, points: rec.points,
    phone: rec.phone || "", email: rec.email || "",
    property_type: rec.property_type || "residential", contact_name: rec.contact_name || "", notes: rec.notes || "",
    equipment: rec.equipment || {}, stage: rec.stage,
    schedule_date: rec.schedule_date, schedule_window: rec.schedule_window, access_pin: rec.access_pin,
    pref_days: rec.pref_days || [], pref_windows: rec.pref_windows || [], asap: !!rec.asap,
    // The applicant's own record, on their own account — SSN/EIN shown masked to last-4; verbal
    // password is only flagged as on file. Full values live on the staff Deck.
    tax_masked: rec.tax_id ? maskTax(decBlob(rec.tax_id), rec.property_type === "commercial") : "",
    has_verbal: !!rec.verbal_password,
    emergency: (() => { try { return JSON.parse(rec.emergency_contacts || "[]"); } catch { return []; } })(),
    deal_accepted: !!rec.deal_accepted_at, status: rec.status || "submitted",
    docs_note: rec.status === "needs_docs" ? (rec.docs_note || "") : "",
  } : null;

  // The customer's quote — ONLY once staff shared it, and ALWAYS sanitized (no cost/commission).
  let quote = null;
  if (rec && rec.deal_shared_at && rec.deal_json) {
    try { quote = custDealFromDeal(JSON.parse(rec.deal_json)); } catch { quote = null; }
  }

  // Session-aware: prefill a fresh intake for a signed-in customer, and route the "My dashboard"
  // button to the right home (customer → /my-projects, staff → /dashboard, PIN-only → none).
  let prefill = null, dashboardHref = null, isStaff = false;
  try {
    const tok = (await cookies()).get("iot_session")?.value;
    const session = tok ? await parseToken(tok) : null;
    isStaff = ["admin", "manager", "sales"].includes(session?.role);   // reps/office get the full equipment picker; customers get the simple questions
    if (session?.role && ["admin", "manager", "sales", "tech"].includes(session.role)) dashboardHref = "/dashboard";
    else if (session?.id) dashboardHref = "/my-projects";
    if (!app && session?.id) {
      const u = getUserById(session.id);
      const projs = session.email ? getProjectsByContactEmail(session.email) : [];
      prefill = { name: u?.name || "", email: session.email || u?.email || "", phone: u?.phone || "", address: projs[0]?.address || "" };
    }
  } catch { /* not signed in → blank + no dashboard button */ }

  return <AdtPortalClient app={app} prefill={prefill} quote={quote} dashboardHref={dashboardHref} isStaff={isStaff} />;
}
