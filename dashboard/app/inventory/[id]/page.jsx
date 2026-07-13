import { redirect, notFound } from "next/navigation";
import { getItemHistory, getAllJobs } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import ItemPageClient from "./item-client";

export default async function InventoryItemPage({ params }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const history = getItemHistory(id);
  if (!history) notFound();

  const alerts   = getNotifSummary(user.id);
  const projects = getAllJobs().map((j) => ({ access_id: j.access_id, customer: j.customer }));

  return <ItemPageClient user={user} alerts={alerts} history={history} projects={projects} />;
}
