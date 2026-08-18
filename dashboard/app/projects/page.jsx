import { getAllJobs, getProjectInventoryShortages, listAdtApplications } from "../../lib/db";
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

// ADT applications are projects too — surfaced on the same board, routed to their own Deck.
const ADT_STAGE = { applied: "adt_applied", scheduled: "adt_scheduled", completed: "adt_completed" };
const slimAdt = (a) => ({
  kind:       "adt",
  access_id:  a.adt_id,
  customer:   a.name || "ADT account",
  service:    (a.property_type === "commercial" ? "Commercial" : "Residential") + " · ADT Monitoring",
  address:    a.address || "",
  stage:      ADT_STAGE[a.stage] || "adt_applied",
  tech:       null,
  value:      0,
  date:       "",
  created_at: a.created_at || null,
});

export default async function ProjectsPage({ searchParams }) {
  const sp     = await searchParams;
  const user      = await getSessionUser();
  const alerts    = getNotifSummary(user.id);
  const jobs      = getAllJobs(); // ordered id DESC → most recent first
  const shortages = getProjectInventoryShortages().map(s => ({ ...s }));
  const shortageSet = new Set(shortages.filter(s => s.over_allocated > 0).map(s => s.project_access_id));
  const slimJobs  = jobs.map(j => ({ ...slim(j), inventoryShort: shortageSet.has(j.access_id) }));
  const adt       = listAdtApplications().map(slimAdt);
  // Interleave by recency so ADT and standard projects share one most-recent-first board.
  const all = [...slimJobs, ...adt].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return <ProjectsClient user={user} alerts={alerts} projects={all} initialFilter={sp?.filter || "all"} />;
}
