import { redirect, notFound } from "next/navigation";
import { resolveServiceCallRef, getServiceCallEvents, getDiagnostics, getStaffUsers, getSvcInvoice, getSvcPayments, ensureSvcProject, getAllJobs } from "../../../lib/db";
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
  // Unlinked call → office picks the system it's about (companion projects excluded — a call
  // never links to itself). Slim list, admin/manager only, only while unlinked.
  const linkable = canManage && !call.project_access_id
    ? getAllJobs().filter((j) => j.project_type !== "C").map((j) => ({ access_id: j.access_id, customer: j.customer }))
    : [];

  // node:sqlite rows are null-prototype objects; plain-clone before crossing to the client component.
  const plain = (r) => (r ? { ...r } : r);

  // Role stripping, same rules as the project gateway: the PIN is an access credential — no
  // client ever needs it; a tech coordinates through the office and never receives the
  // customer's direct contact channels. Server-side, not hidden UI.
  const safeCall = { ...call };
  delete safeCall.customer_pin;
  if (user.role === "tech") {
    safeCall.contact_phone = null;
    safeCall.contact_email = null;
  }

  return (
    <SvcDetailClient
      user={user}
      alerts={alerts}
      call={plain(safeCall)}
      events={events.map(plain)}
      diagnostics={diagnostics.map(plain)}
      techs={techs.map(plain)}
      invoice={plain(invoice)}
      payments={payments.map(plain)}
      rates={canManage ? SVC_RATES : []}
      linkable={linkable.map(plain)}
    />
  );
}
