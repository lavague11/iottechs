import { redirect } from "next/navigation";
import { getDevTasks, getAllJobs } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import DevClient from "./dev-client";

export default async function DevPage() {
  const user = await getSessionUser();
  if (user.role !== "admin") redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const tasks  = getDevTasks();
  const sample = getAllJobs()[0]?.access_id || null;

  return <DevClient user={user} alerts={alerts} tasks={tasks} sampleProjectId={sample} />;
}
