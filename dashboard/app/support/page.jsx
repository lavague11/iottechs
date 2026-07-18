import { redirect } from "next/navigation";
import { getSupportArticles } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import SupportClient from "./support-client";

// Support library — the internal FAQ / knowledge base. Any staff role can read it; admin & manager
// author and maintain it (see actions.js). Customers have their own portal help, not this page.
export default async function SupportPage() {
  const user = await getSessionUser();
  if (!["admin", "manager", "sales", "tech"].includes(user.role)) redirect("/login");

  const alerts   = getNotifSummary(user.id);
  const articles = getSupportArticles();
  return <SupportClient user={user} alerts={alerts} articles={articles} />;
}
