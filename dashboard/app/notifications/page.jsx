import { getNotificationFeed } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import NotificationsClient from "./notifications-client";

export default async function NotificationsPage() {
  const user   = await getSessionUser();
  const alerts  = getNotifSummary(user.id);
  const items  = user.id ? getNotificationFeed(user.id, user.role) : [];
  return <NotificationsClient user={user} alerts={alerts} items={items} />;
}
