import { redirect } from "next/navigation";
import { getUserById, getProjectsForUser, getProjectsForCustomer, getLoginStatsMap, getUserDevices } from "../../../lib/db";
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
  // A customer owns projects via projects.customer_id (no assignment row), so merge both and dedupe —
  // the profile should show the projects that are actually theirs, not an empty "unassigned" state.
  const assigned  = getProjectsForUser(Number(id));
  const owned     = profile.role === "customer" ? getProjectsForCustomer(Number(id)) : [];
  const seen      = new Set(assigned.map((p) => p.access_id));
  const projects  = [...assigned, ...owned.filter((p) => !seen.has(p.access_id))];
  const loginStat = statsMap[profile.id] || {};
  // Devices this account has signed in from — an unfamiliar one is worth a second look.
  const devices   = getUserDevices(profile.id);

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
      devices={devices}
      canStartProject={profile.role === "customer"}
    />
  );
}
