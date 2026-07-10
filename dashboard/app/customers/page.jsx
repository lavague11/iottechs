import { getCustomersWithStats } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import CustomersClient from "./customers-client";

export default async function CustomersPage() {
  const user      = await getSessionUser();
  const alerts    = getNotifSummary(user.id);
  const customers = JSON.parse(JSON.stringify(getCustomersWithStats()));
  return <CustomersClient user={user} alerts={alerts} customers={customers} />;
}
