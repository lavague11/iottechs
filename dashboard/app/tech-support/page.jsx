import { redirect } from "next/navigation";
import { getSupportArticles } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import SupportClient from "../support/support-client";

// Technician support portal — a more technical version of the Support library, for service calls
// and camera issues. Same engine as the customer library (SupportClient), filtered to the 'tech'
// audience. Technicians and up may read; admin/manager author (see support/actions.js).
export default async function TechSupportPage() {
  const user = await getSessionUser();
  if (!["admin", "manager", "tech"].includes(user.role)) redirect("/login");

  const alerts   = getNotifSummary(user.id);
  const articles = getSupportArticles("tech");
  return (
    <SupportClient
      user={user}
      alerts={alerts}
      articles={articles}
      audience="tech"
      heading="Tech Support"
      subheading="Field diagnostics & service-call reference"
    />
  );
}
