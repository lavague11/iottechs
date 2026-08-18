import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { getAdtApplication, getUserById, getProjectsByContactEmail } from "../../lib/db";
import { custDealFromDeal } from "../../lib/adt";
import AdtPortalClient from "./adt-portal-client";

export const metadata = { title: "ADT Project Portal · IOT TECHS" };

// The ADT portal: Apply → Schedule → Complete. Fresh visit (no ?id) shows the intake form; once
// submitted we route to /adt?id=ADT0001 and the portal advances with the application's stage.
export default async function AdtPage({ searchParams }) {
  const sp  = await searchParams;
  const rec = sp?.id ? getAdtApplication(sp.id) : null;
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
