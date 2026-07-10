import { getVisibleJobs, getTickets, getCustomers } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import SalesClient from "./sales-client";

const slim = (j) => ({
  access_id:         j.access_id,
  customer:          j.customer,
  service:           j.service || j.service_code,
  address:           j.address,
  stage:             j.stage,
  value:             j.value || 0,
  category:          j.category,
  commission_rate:   j.commission_rate   ?? 0,
  commission_status: j.commission_status || "pending",
  sales_rep:         j.sales_rep         || null,
  commission_amount: Math.round((j.value || 0) * (j.commission_rate || 0) / 100),
});

export default async function SalesPage() {
  const user   = await getSessionUser();
  const alerts = getNotifSummary(user.id);
  const jobs   = getVisibleJobs(user.id, user.role);

  // Commission is personal. A sales rep can see the shared pipeline, but only their OWN
  // commission figures — never another rep's. Admin/manager see everything.
  const isRep = user.role === "sales";
  const norm  = (s) => String(s || "").trim().toLowerCase();
  const ownsJob = (j) => !isRep || (j.sales_rep && norm(j.sales_rep) === norm(user.name));
  // slim + strip commission fields on deals this viewer doesn't own.
  const view = (j) => { const s = slim(j); if (!ownsJob(j)) { s.commission_rate = 0; s.commission_amount = 0; s.commission_status = null; } return s; };

  const pipeline  = jobs.filter((j) => ["open", "pending"].includes(j.category));
  const active    = jobs.filter((j) => ["schedule", "install", "qc"].includes(j.stage));
  const completed = jobs.filter((j) => j.category === "completed");
  const upgrades  = jobs.filter((j) => j.category === "upgrade");

  const tickets   = getTickets().map(r => ({ ...r }));
  const customers = getCustomers();

  // Needs follow-up: proposals sitting without movement
  const followUp = jobs.filter(j => ["inquiry","proposal","approval_deposit"].includes(j.stage));

  // KPI commission totals count only the viewer's own deals.
  const ownSlim = jobs.filter(ownsJob).map(slim);
  const commPending = ownSlim.filter(j => j.commission_amount > 0 && j.commission_status === "pending")
    .reduce((s, j) => s + j.commission_amount, 0);
  const commPaid = ownSlim.filter(j => j.commission_amount > 0 && j.commission_status === "paid")
    .reduce((s, j) => s + j.commission_amount, 0);

  const stats = {
    pipelineValue: pipeline.reduce((s, j) => s + (j.value || 0), 0),
    activeValue:   active.reduce((s, j) => s + (j.value || 0), 0),
    closedValue:   completed.reduce((s, j) => s + (j.value || 0), 0),
    pipelineCount: pipeline.length,
    activeCount:   active.length,
    closedCount:   completed.length,
    followUpCount: followUp.length,
    commPending,
    commPaid,
  };

  return (
    <SalesClient
      user={user} alerts={alerts}
      pipeline={pipeline.map(view)} active={active.map(view)}
      completed={completed.map(view)} upgrades={upgrades.map(view)}
      followUp={followUp.map(view)}
      tickets={tickets} customers={customers}
      stats={stats}
    />
  );
}
