import { verifyApptToken } from "../../../lib/auth";
import { getJobByAccessId, getToolData } from "../../../lib/db";
import ApptClient from "./appt-client";

export const dynamic = "force-dynamic";

export default async function ApptPage({ params, searchParams }) {
  const { token } = await params;
  const sp = (await searchParams) || {};
  const mode = sp.do === "confirm" ? "confirm" : "change";
  const t = await verifyApptToken(token);
  if (!t) return <ApptClient invalid />;

  const p = getJobByAccessId(t.accessId);
  let ev = null;
  try {
    const raw = getToolData(t.accessId, "schedule")?.data;
    const d = raw ? JSON.parse(raw) : {};
    ev = (d.events || []).find((e) => String(e.id) === String(t.eventId)) || null;
  } catch { /* show a generic prompt if the event can't be read */ }

  return <ApptClient token={token} mode={mode} event={ev ? { title: ev.title, date: ev.date, time: ev.time, confirmed: !!ev.confirmed_at } : null} />;
}
