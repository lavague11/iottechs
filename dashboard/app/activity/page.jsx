import { redirect } from "next/navigation";
import { getActivityLog } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ActivityClient from "./activity-client";

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const events = getActivityLog(500).map((e) => ({ ...e }));
  return <ActivityClient user={user} alerts={alerts} events={events} actorRole={user.role} />;
}
