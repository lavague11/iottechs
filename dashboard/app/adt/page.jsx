import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../lib/auth";
import { getAdtApplication, getUserById, getProjectsByContactEmail } from "../../lib/db";
import { custDealFromDeal } from "../../lib/adt";
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
    equipment: rec.equipment || {}, stage: rec.stage,
    schedule_date: rec.schedule_date, schedule_window: rec.schedule_window, access_pin: rec.access_pin,
    pref_days: rec.pref_days || [], pref_windows: rec.pref_windows || [],
    deal_accepted: !!rec.deal_accepted_at,
  } : null;

  // The customer's quote — ONLY once staff shared it, and ALWAYS sanitized (no cost/commission).
  let quote = null;
  if (rec && rec.deal_shared_at && rec.deal_json) {
    try { quote = custDealFromDeal(JSON.parse(rec.deal_json)); } catch { quote = null; }
  }

  // Smart-defaults: a logged-in customer arriving from their portal gets the intake prefilled with
  // what we already know (name · email · phone · their project address). Anonymous visitors → blank.
  let prefill = null;
  if (!app) {
    try {
      const tok = (await cookies()).get("iot_session")?.value;
      const session = tok ? await parseToken(tok) : null;
      if (session?.id) {
        const u = getUserById(session.id);
        const projs = session.email ? getProjectsByContactEmail(session.email) : [];
        prefill = { name: u?.name || "", email: session.email || u?.email || "", phone: u?.phone || "", address: projs[0]?.address || "" };
      }
    } catch { /* not signed in → blank form */ }
  }

  return <AdtPortalClient app={app} prefill={prefill} quote={quote} />;
}
