import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import IdScanClient from "./id-scan-client";

// ID Scanner — staff-only tool. Photograph a driver's licence, read + validate it,
// and hand back a customer record used to fill intake forms / create accounts.
export default async function IdScanPage() {
  const user = await getSessionUser();
  if (!user?.id) redirect("/login");

  const alerts = getNotifSummary(user.id);
  return <IdScanClient user={user} alerts={alerts} />;
}
