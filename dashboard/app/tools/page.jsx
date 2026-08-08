import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ToolsClient from "./tools-client";

// Document tools library — admin & manager only.
export default async function ToolsPage() {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) redirect("/dashboard");
  const alerts = getNotifSummary(user.id);
  return <ToolsClient user={user} alerts={alerts} />;
}
