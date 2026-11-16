import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { getOwnedProjectsForCustomer, getUserById, getServiceCallsForCustomer, getProjectCameraLabels, buildStageFacts, getStageAcceptances, getToolData, getProjectFinancialState, getActiveProposal } from "../../lib/db";
import { buildMyProjectCard } from "../../lib/my-projects-card";
import { financeSummary } from "../../lib/customer-portal";
import MyProjectsClient from "./my-projects-client";

export default async function MyProjectsPage() {
  const jar     = await cookies();
  const tok     = jar.get("iot_session")?.value;
  const session = tok ? await parseToken(tok) : null;

  // Fetch full user record to get name + phone from DB
  const dbUser  = session?.id ? getUserById(session.id) : null;
  const user    = dbUser ? { ...session, name: dbUser.name, phone: dbUser.phone } : session;

  // Canonical ownership (email OR phone OR customer id OR roster) — not email alone.
  const raw = user?.id ? getOwnedProjectsForCustomer({ userId: user.id, email: user.email, phone: user.phone }) : [];

  // The customer's browser receives these as props (RSC payload), so anything on the object is
  // readable in devtools even if the UI never renders it. buildMyProjectCard returns an explicit
  // customer-safe whitelist — stage, status, percent and appointment are RECOMPUTED here from the
  // same resolvers the staff portal uses, never read from the stored stage column.
  const projects = raw.map((p) => {
    let facts = null, events = [], fin = null, started = false;
    try {
      facts = buildStageFacts(p.access_id);
      if (facts) facts.survey_submitted = !!getStageAcceptances(p.access_id)?.submit_site_survey;
      try { events = JSON.parse(getToolData(p.access_id, "schedule")?.data || "{}")?.events || []; } catch { events = []; }
      fin = financeSummary(getProjectFinancialState(p.access_id), 0);
      started = !!getActiveProposal(p.access_id)?.payload;
    } catch { /* a project whose facts can't build still renders, from its row */ }
    return {
      ...buildMyProjectCard({ project: p, facts: facts || { stage: p.stage }, events, fin, proposalStarted: started }),
      // Named camera locations for the service-call "which camera?" picker — the customer's own labels.
      cameraLabels: getProjectCameraLabels(p.access_id),
    };
  });

  // Their service calls (matched by email OR phone — intake often captures phone-only), slimmed
  // to customer-safe display fields. Renders only when at least one exists.
  const serviceCalls = (user ? getServiceCallsForCustomer(user.email, user.phone) : []).map((c) => ({
    svc_id: c.svc_id,
    issue: c.issue,
    category: c.category,
    stage: c.stage,
    created_at: c.created_at,
    project_access_id: c.project_access_id || null,   // which project this call is about (for the 1-open-per-project rule)
  }));

  return <MyProjectsClient user={user} projects={projects} serviceCalls={serviceCalls} />;
}
