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
  const att = t.who;                                    // the specific recipient this link is for
  let ev = null, alreadyConfirmed = false;
  try {
    const raw = getToolData(t.accessId, "schedule")?.data;
    const d = raw ? JSON.parse(raw) : {};
    ev = (d.events || []).find((e) => String(e.id) === String(t.eventId)) || null;
    if (ev) {
      const key = (att?.email || "customer").toLowerCase();
      alreadyConfirmed = !!(ev.confirmations && ev.confirmations[key]) || ((!att || att.role === "customer") && !!ev.confirmed_at);
    }
  } catch { /* show a generic prompt if the event can't be read */ }

  const who = (att?.name || "").trim() || p?.contact_name || "";
  return <ApptClient token={token} mode={mode} who={who} event={ev ? { title: ev.title, date: ev.date, time: ev.time, confirmed: alreadyConfirmed } : null} />;
}
