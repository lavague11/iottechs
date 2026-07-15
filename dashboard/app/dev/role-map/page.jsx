import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import RoleMapClient from "./role-map-client";

// Admin-only developer reference: the role × phase × blocks map of the project page.
export default async function RoleMapPage() {
  const user = await getSessionUser();
  if (user.role !== "admin") redirect("/dashboard");
  const alerts = getNotifSummary(user.id);
  return <RoleMapClient user={user} alerts={alerts} />;
}
