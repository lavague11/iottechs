import { getNotifications } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import NotificationsClient from "./notifications-client";

export default async function NotificationsPage() {
  const user   = await getSessionUser();
  const alerts  = getNotifSummary(user.id);
  const items  = user.id ? getNotifications(user.id, 200) : [];
  return <NotificationsClient user={user} alerts={alerts} items={items} />;
}
