import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { getUserIdentity } from "../../lib/db";
import EnrollClient from "./enroll-client";

// Self-service face + ID enrolment. Any signed-in staff member enrols their own
// account; the row is keyed to their user id server-side.
export default async function EnrollPage() {
  const user = await getSessionUser();
  if (!user?.id) redirect("/login");

  const alerts = getNotifSummary(user.id);
  const cur = getUserIdentity(user.id);        // status only — no photos pulled
  const current = cur ? { status: cur.status, id_type: cur.id_type, enrolled_at: cur.enrolled_at } : null;

  return <EnrollClient user={user} alerts={alerts} current={current} />;
}
