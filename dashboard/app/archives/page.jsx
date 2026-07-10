import { redirect } from "next/navigation";
import { getArchives } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ArchivesClient from "./archives-client";

export default async function ArchivesPage() {
  const user = await getSessionUser();
  if (user.role !== "admin") redirect("/dashboard");

  const alerts   = getNotifSummary(user.id);
  const archives = getArchives();

  return <ArchivesClient user={user} alerts={alerts} archives={archives} />;
}
