import { redirect } from "next/navigation";
import { getInventory, getInventoryStats, getAllJobs, getProjectInventoryShortages } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import InventoryClient from "./inventory-client";

export default async function InventoryPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts    = getNotifSummary(user.id);
  const items     = getInventory();
  const stats     = getInventoryStats();
  const projects  = getAllJobs().map((j) => ({ access_id: j.access_id, customer: j.customer }));
  const shortages = getProjectInventoryShortages().map(s => ({ ...s }));

  return <InventoryClient user={user} alerts={alerts} items={items} stats={stats} projects={projects} shortages={shortages} />;
}
