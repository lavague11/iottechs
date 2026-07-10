import { getCustomerProfile } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import CustomerProfileClient from "./customer-profile-client";

export default async function CustomerProfilePage({ params }) {
  const name = decodeURIComponent((await params).slug);
  const user   = await getSessionUser();
  const alerts = getNotifSummary(user.id);
  const result = getCustomerProfile(name);

  return (
    <CustomerProfileClient
      user={user}
      alerts={alerts}
      notFoundName={result ? null : name}
      customer={result ? JSON.parse(JSON.stringify(result.customer)) : null}
      jobs={result ? JSON.parse(JSON.stringify(result.jobs)) : []}
    />
  );
}
