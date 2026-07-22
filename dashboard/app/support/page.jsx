import { redirect } from "next/navigation";
import { getSupportArticles, getProjectsWithSystemQr } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import SupportClient from "./support-client";

// Support library — the internal FAQ / knowledge base. Any staff role can read it; admin & manager
// author and maintain it (see actions.js). Customers have their own portal help, not this page.
export default async function SupportPage() {
  const user = await getSessionUser();
  if (!["admin", "manager", "sales", "tech"].includes(user.role)) redirect("/login");

  const alerts   = getNotifSummary(user.id);
  const articles = getSupportArticles("customer");
  // Projects with a System QR — lets the Mobile App Setup guide show a QR when the customer says
  // they don't have their card. Admin/manager preview all; other staff see none here.
  const qrProjects = ["admin", "manager"].includes(user.role) ? getProjectsWithSystemQr() : [];
  return <SupportClient user={user} alerts={alerts} articles={articles} qrProjects={qrProjects} />;
}
