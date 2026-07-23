import { redirect, notFound } from "next/navigation";
import { resolveServiceCallRef, getServiceCallEvents, getDiagnostics, getStaffUsers } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import SvcDetailClient from "./svc-detail-client";

// Service-call detail — the focused gateway for one call. Staff view for now (customer/tech PIN
// gate lands in the next phase). Shows the stage strip, details, timeline, and diagnostic records.
export default async function ServiceCallDetailPage({ params }) {
  const { svcId } = await params;
  const user = await getSessionUser();
  if (!["admin", "manager", "tech"].includes(user.role)) redirect("/login");

  const call = resolveServiceCallRef(svcId);
  if (!call) notFound();

  const alerts      = getNotifSummary(user.id);
  const events      = getServiceCallEvents(call.svc_id);
  const diagnostics = getDiagnostics(call.svc_id);
  const techs       = ["admin", "manager"].includes(user.role)
    ? getStaffUsers().filter((u) => u.role === "tech").map((u) => ({ id: u.id, name: u.name }))
    : [];

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
    />
  );
}
