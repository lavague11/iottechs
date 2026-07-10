import { redirect } from "next/navigation";
import { getAllUsers, getLoginStatsMap } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import UsersClient from "./users-client";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts   = getNotifSummary(user.id);
  const statsMap = getLoginStatsMap();
  const users = getAllUsers().map((u) => ({
    ...u,
    last_login:   statsMap[u.id]?.last_login   || null,
    last_logout:  statsMap[u.id]?.last_logout  || null,
    session_mins: statsMap[u.id]?.session_mins ?? null,
  }));

  return <UsersClient user={user} alerts={alerts} users={users} actorRole={user.role} />;
}
