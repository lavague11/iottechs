import { redirect } from "next/navigation";
import { getUserById, getProjectsForUser, getLoginStatsMap } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import ProfileClient from "./profile-client";

export default async function UserProfilePage({ params }) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  if (!["admin", "manager"].includes(sessionUser.role)) redirect("/dashboard");

  const profile = getUserById(Number(id));
  if (!profile) redirect("/users");

  const alerts    = getNotifSummary(sessionUser.id);
  const statsMap  = getLoginStatsMap();
  const projects  = getProjectsForUser(Number(id));
  const loginStat = statsMap[profile.id] || {};

  return (
    <ProfileClient
      user={sessionUser}
      alerts={alerts}
      profile={{
        ...profile,
        last_login:   loginStat.last_login   || null,
        last_logout:  loginStat.last_logout  || null,
        session_mins: loginStat.session_mins ?? null,
      }}
      projects={projects}
    />
  );
}
