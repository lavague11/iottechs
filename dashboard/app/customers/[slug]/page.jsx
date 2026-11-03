import { redirect } from "next/navigation";
import { getCustomerHub, findCustomerIdByName, getCustomerProfile } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import { can } from "../../../lib/roles";
import CustomerHubClient from "./customer-hub-client";
import CustomerProfileClient from "./customer-profile-client";

// Customer homepage (admin side). Id-first: a numeric slug is the canonical customer id → the rich hub.
// A legacy name link resolves to that id and redirects; an un-migrated name with no users row keeps the
// old name-keyed profile so nothing 404s. Customer records are office data — staff who can search clients.
export default async function CustomerProfilePage({ params }) {
  const slug = decodeURIComponent((await params).slug);
  const user = await getSessionUser();
  if (!can(user.role, "customer.search")) redirect("/dashboard");
  const alerts = getNotifSummary(user.id);

  if (/^\d+$/.test(slug)) {
    const hub = getCustomerHub(Number(slug));
    if (hub) return <CustomerHubClient user={user} alerts={alerts} hub={JSON.parse(JSON.stringify(hub))} />;
    // Numeric but not a customer → fall through to the not-found view below.
  } else {
    const id = findCustomerIdByName(slug);
    if (id) redirect(`/customers/${id}`);
  }

  // Fallback: the legacy name-keyed profile for customers with no canonical users row yet.
  const result = getCustomerProfile(slug);
  return (
    <CustomerProfileClient
      user={user}
      alerts={alerts}
      notFoundName={result ? null : slug}
      customer={result ? JSON.parse(JSON.stringify(result.customer)) : null}
      jobs={result ? JSON.parse(JSON.stringify(result.jobs)) : []}
    />
  );
}
