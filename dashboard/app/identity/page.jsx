import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { listIdentities, identityStats } from "../../lib/db";
import IdentityClient from "./identity-client";

// Identity library — every enrolled account, its two photos (face + ID), verify
// status and controls. Admin/manager only; these are IDs + biometrics.
export default async function IdentityPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows = listIdentities();
  const stats = identityStats();

  return <IdentityClient user={user} alerts={alerts} rows={rows} stats={stats} />;
}
