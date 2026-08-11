import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import LivenessTestClient from "./liveness-test-client";

// Isolated test bench for AWS Face Liveness — prove it works with your keys
// before wiring it into login. Admin/manager only (each check costs money).
export default async function LivenessPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");
  const alerts = getNotifSummary(user.id);
  return <LivenessTestClient user={user} alerts={alerts} />;
}
