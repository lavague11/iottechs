import { redirect, notFound } from "next/navigation";
import { resolveServiceCallRef, getSvcDiagnosis, getSvcInvoice, getSvcPayments, getJobByAccessId, svcSignaturesCurrent } from "../../../../lib/db";
import { getSessionUser } from "../../../../lib/session";
import { warrantyStatus } from "../../../../lib/svc-model";
import SvcReport from "../svc-report";

// Printable Service Call Report — the same record as the detail page (call + diagnosis + invoice).
// Staff only here; a tech sees the report without retail charges (role rule, stripped server-side).
export default async function ServiceCallReportPage({ params }) {
  const { svcId } = await params;
  const user = await getSessionUser();
  if (!["admin", "manager", "tech"].includes(user.role)) redirect("/login");
  const call = resolveServiceCallRef(svcId);
  if (!call) notFound();
  const canManage = ["admin", "manager"].includes(user.role);
  const doc = getSvcDiagnosis(call.svc_id)?.doc || null;
  const invoice = canManage ? getSvcInvoice(call.svc_id) : null;
  const payments = canManage ? getSvcPayments(call.svc_id) : [];
  const project = call.project_access_id ? getJobByAccessId(call.project_access_id) : null;
  const plain = (r) => (r ? JSON.parse(JSON.stringify(r)) : r);
  const safeCall = { ...call }; delete safeCall.customer_pin;
  if (user.role === "tech") { safeCall.contact_phone = null; safeCall.contact_email = null; }
  return (
    <main style={{ padding: "16px", background: "#f4f4f2", minHeight: "100vh" }}>
      <SvcReport call={plain(safeCall)} doc={doc} invoice={plain(invoice)} payments={payments.map(plain)} warranty={warrantyStatus(project)}
        backHref={`/service-calls/${call.svc_id}`} showCharges={canManage} signaturesCurrent={svcSignaturesCurrent(call)} />
    </main>
  );
}
