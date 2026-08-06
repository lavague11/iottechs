import { getAdtApplication } from "../../lib/db";
import AdtPortalClient from "./adt-portal-client";

export const metadata = { title: "ADT Project Portal · IOT TECHS" };

// The ADT portal: Apply → Schedule → Complete. Fresh visit (no ?id) shows the intake form; once
// submitted we route to /adt?id=ADT0001 and the portal advances with the application's stage.
export default async function AdtPage({ searchParams }) {
  const sp  = await searchParams;
  const rec = sp?.id ? getAdtApplication(sp.id) : null;
  const app = rec ? {
    adt_id: rec.adt_id, name: rec.name, address: rec.address, points: rec.points,
    equipment: rec.equipment || {}, stage: rec.stage,
    schedule_date: rec.schedule_date, schedule_window: rec.schedule_window, access_pin: rec.access_pin,
  } : null;
  return <AdtPortalClient app={app} />;
}
