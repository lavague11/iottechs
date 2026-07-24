import { redirect, notFound } from "next/navigation";
import { resolveServiceCallRef, getServiceCallEvents, getDiagnostics, getStaffUsers, getSvcInvoice, getSvcPayments, ensureSvcProject } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import { SVC_RATES } from "../../../lib/spec";
import SvcDetailClient from "./svc-detail-client";

// Service-call detail — the focused gateway for one call. Staff view for now (customer/tech PIN
// gate lands in the next phase). Shows the stage strip, details, timeline, and diagnostic records.
export default async function ServiceCallDetailPage({ params }) {
  const { svcId } = await params;
  const user = await getSessionUser();
  if (!["admin", "manager", "tech"].includes(user.role)) redirect("/login");

  let call = resolveServiceCallRef(svcId);
  if (!call) notFound();
  // Companion type-C project (lazy for pre-existing calls) — the full gateway page for this call.
  const svcProject = ensureSvcProject(call.svc_id);
  if (svcProject && !call.svc_project_id) call = { ...call, svc_project_id: svcProject.access_id };

  const alerts      = getNotifSummary(user.id);
  const events      = getServiceCallEvents(call.svc_id);
  const diagnostics = getDiagnostics(call.svc_id);
  const canManage   = ["admin", "manager"].includes(user.role);
  const techs       = canManage
    ? getStaffUsers().filter((u) => u.role === "tech").map((u) => ({ id: u.id, name: u.name }))
    : [];
  // Billing is retail-priced — admin/manager only, stripped server-side so a tech's browser
  // never receives it (role visibility rule, not just hidden UI).
  const invoice  = canManage ? getSvcInvoice(call.svc_id) : null;
  const payments = canManage ? getSvcPayments(call.svc_id) : [];

  // node:sqlite rows are null-prototype objects; plain-clone before crossing to the client component.
  const plain = (r) => (r ? { ...r } : r);

  return (
    <SvcDetailClient
      user={user}
      alerts={alerts}
      call={plain(call)}
      events={events.map(plain)}
      diagnostics={diagnostics.map(plain)}
      techs={techs.map(plain)}
      invoice={plain(invoice)}
      payments={payments.map(plain)}
      rates={canManage ? SVC_RATES : []}
    />
  );
}
