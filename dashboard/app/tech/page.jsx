import { getVisibleJobs, getExpenses, getTickets } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import TechClient from "./tech-client";

export default async function TechPage() {
  const user    = await getSessionUser();
  const alerts  = getNotifSummary(user.id);
  const jobs    = getVisibleJobs(user.id, user.role);
  const today   = new Date().toISOString().slice(0, 10);

  const firstName = (user.name || "").split(/\s+/)[0].replace(/\s*\(.*\)/, "");

  const myJobs        = jobs.filter((j) => j.tech && j.tech.split(/\s+/)[0].toLowerCase() === firstName.toLowerCase());
  // Unassigned = no tech set AND at an active field stage (not already taken by someone else)
  const unassignedJobs = jobs.filter((j) => (!j.tech || j.tech.trim() === "") && ["schedule","install"].includes(j.stage));

  const myAccessIds   = myJobs.map((j) => j.access_id);
  const allExpenses   = getExpenses();
  const expenses      = myAccessIds.length
    ? allExpenses.filter((e) => e.access_id && myAccessIds.includes(e.access_id))
    : allExpenses.slice(0, 5);

  const nameLower = firstName.toLowerCase();
  const tickets = getTickets()
    .filter((t) => {
      // Ticket linked to one of my projects
      if (t.access_id && myAccessIds.includes(t.access_id)) return true;
      // Ticket assigned to me by name
      if (t.assignee_name && t.assignee_name.split(/\s+/)[0].toLowerCase() === nameLower) return true;
      return false;
    })
    .map(r => ({ ...r }));

  // Techs never see customer/retail pricing — omit `value` (project retail total) from the payload.
  // Their compensation comes through the work order (tech payout), not the project value.
  const slim = (j) => ({
    access_id: j.access_id,
    customer:  j.customer,
    service:   j.service || j.service_code,
    address:   j.address,
    stage:     j.stage,
    tech:      j.tech,
    date:      j.date,
    issue:     j.issue,
    cameras:   j.cameras,
  });

  return (
    <TechClient
      user={user}
      alerts={alerts}
      myJobs={myJobs.map(slim)}
      unassignedJobs={unassignedJobs.map(slim)}
      expenses={expenses}
      tickets={tickets}
      today={today}
    />
  );
}
