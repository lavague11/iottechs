import { getAllJobs, getProjectInventoryShortages } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ProjectsClient from "./projects-client";

const slim = (j) => ({
  access_id:  j.access_id,
  customer:   j.customer,
  service:    j.service || j.service_code,
  address:    j.address,
  stage:      j.stage,
  tech:       j.tech || null,
  value:      j.value,
  date:       j.date,
  category:   j.category,
  project_type: j.project_type,
  created_at: j.created_at || null,
});

export default async function ProjectsPage({ searchParams }) {
  const sp     = await searchParams;
  const user      = await getSessionUser();
  const alerts    = getNotifSummary(user.id);
  const jobs      = getAllJobs(); // ordered id DESC → most recent first
  const shortages = getProjectInventoryShortages().map(s => ({ ...s }));
  const shortageSet = new Set(shortages.filter(s => s.over_allocated > 0).map(s => s.project_access_id));
  const slimWithShortage = jobs.map(j => ({ ...slim(j), inventoryShort: shortageSet.has(j.access_id) }));
  return <ProjectsClient user={user} alerts={alerts} projects={slimWithShortage} initialFilter={sp?.filter || "all"} />;
}
