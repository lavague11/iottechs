import { getSessionUser } from "../../../lib/session";
import { getVisibleJobs, getTickets, listServiceCalls, getStaffUsers, getRecentProjectIdsForUser, listProposalsForSearch } from "../../../lib/db";
import { searchEntities } from "../../../lib/search";

export const dynamic = "force-dynamic";

const STAFF = new Set(["admin", "manager", "sales", "tech"]);

// ONE canonical global-search endpoint. Permission scoping happens HERE (server-side): each role only
// ever gets data it may see, so a tech can't discover a customer/ticket they aren't allowed to.
export async function GET(req) {
  const user = await getSessionUser();
  if (!user || !STAFF.has(user.role)) return Response.json({ groups: [], total: 0 }, { status: 200 });
  const role = user.role, isMgr = role === "admin" || role === "manager";
  const { searchParams } = new URL(req.url);

  // Empty-state: the user's own recently-opened projects (reuses the dashboard recents system).
  if (searchParams.get("recent")) {
    const byId = Object.fromEntries(getVisibleJobs(user.id, role).map((j) => [j.access_id, j]));
    const items = getRecentProjectIdsForUser(user.id, 5)
      .map((id) => byId[id]).filter(Boolean).filter((j) => !j.lost_at).slice(0, 5)
      .map((j) => ({ type: "project", id: j.access_id, title: j.customer || j.access_id,
        subtitle: [j.access_id, j.service || j.service_code, j.stageLabel].filter(Boolean).join(" · "),
        href: `/project/${j.access_id}` }));
    return Response.json({ recent: items });
  }

  const q = (searchParams.get("q") || "").trim();
  if (q.length < 1) return Response.json({ groups: [], total: 0 });

  // Role-scoped inputs — only what each role is allowed to see.
  const projects = getVisibleJobs(user.id, role);   // already restricted per role
  let tickets = getTickets().filter((t) => t.status !== "closed");
  if (!isMgr) tickets = tickets.filter((t) => (t.audienceList || []).includes(role) || t.assignee_id === user.id || t.opened_by_id === user.id);
  const serviceCalls = (isMgr || role === "tech") ? listServiceCalls() : [];
  const technicians = isMgr ? getStaffUsers().filter((u) => u.role === "tech").map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email })) : [];
  // Proposals: admin/manager/sales only, scoped to projects this user can see.
  let proposals = [];
  if (isMgr || role === "sales") {
    const visible = new Set(projects.map((p) => p.access_id));
    proposals = listProposalsForSearch().filter((pr) => visible.has(pr.project_access_id));
  }

  const data = searchEntities({ q, projects, proposals, tickets, serviceCalls, technicians });
  // Sales/tech don't get a Customers directory group (they reach customers through their projects).
  const groups = (role === "sales" || isMgr) ? data.groups : data.groups.filter((g) => g.type !== "customer");
  return Response.json({ groups, total: groups.reduce((s, g) => s + g.items.length, 0) });
}
