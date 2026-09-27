"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { setServiceCallStage, logServiceCallEvent, getServiceCall, assignServiceCallTech, addDiagnostic, saveSvcInvoice, sendSvcInvoice, voidSvcInvoice, addSvcPayment, linkServiceCallProject, saveSvcDiagnosis, signSvcReport, unsignSvcReport, createFollowUpServiceCall, createServiceCall, getJobByAccessId, getCustomerSummary } from "../../lib/db";
import { can } from "../../lib/roles";

async function requireStaff(roles = ["admin", "manager", "tech"]) {
  const user = await getSessionUser();
  if (!roles.includes(user.role)) return { user: null, error: "Not authorized." };
  return { user, error: null };
}

export async function setSvcStageAction(svcId, stage) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const r = setServiceCallStage(svcId, stage, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not update stage." };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath("/service-calls");
  return { ok: true, call: r };
}

export async function addSvcNoteAction(svcId, body) {
  const { user, error } = await requireStaff();
  if (error) return { ok: false, error };
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "Note is empty." };
  if (!getServiceCall(svcId)) return { ok: false, error: "Service call not found." };
  logServiceCallEvent(svcId, { kind: "note", detail: text, actor_role: user.role, actor_name: user.name });
  revalidatePath(`/service-calls/${svcId}`);
  return { ok: true };
}

// A tech/admin/manager runs the full TRACE diagnostic against the call — same concept as the
// customer's 60-second check, but the technician trees. Logs a mode="tech" diagnostic to the
// same record the customer's writes to, so every check is on one timeline.
export async function runStaffDiagnosticAction(svcId, record) {
  const { user, error } = await requireStaff(["admin", "manager", "tech"]);
  if (error) return { ok: false, error };
  if (!getServiceCall(svcId)) return { ok: false, error: "Service call not found." };
  const steps = Array.isArray(record?.steps) ? record.steps.slice(0, 60) : [];
  const outcome = record?.outcome && typeof record.outcome === "object" ? record.outcome : null;
  addDiagnostic(svcId, {
    mode: "tech",
    technician: user.name,
    issue: String(record?.issue || "").slice(0, 200) || null,
    steps, outcome,
    started: record?.started || null, completed: record?.completed || null,
    actor_role: user.role, actor_name: user.name,
  });
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
  return { ok: true };
}

// ---- Billing — admin/manager only (a tech never sees retail prices). ----
export async function saveSvcInvoiceAction(svcId, items, notes) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  if (!getServiceCall(svcId)) return { ok: false, error: "Service call not found." };
  const inv = saveSvcInvoice(svcId, { items, notes }, { actor_role: user.role, actor_name: user.name });
  revalidatePath(`/service-calls/${svcId}`);
  return { ok: true, invoice: inv };
}

export async function sendSvcInvoiceAction(svcId) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const inv = sendSvcInvoice(svcId, { actor_role: user.role, actor_name: user.name });
  if (!inv) return { ok: false, error: "Add at least one line first." };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
  return { ok: true, invoice: inv };
}

export async function voidSvcInvoiceAction(svcId) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  voidSvcInvoice(svcId, { actor_role: user.role, actor_name: user.name });
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
  return { ok: true };
}

export async function recordSvcPaymentAction(svcId, amount, method, paidAt) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  if (!getServiceCall(svcId)) return { ok: false, error: "Service call not found." };
  const payments = addSvcPayment(svcId, { amount, method, paidAt }, user.name);
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
  return { ok: true, payments };
}

// Link the call to the system it's about (post-intake). Admin/manager only.
export async function linkSvcProjectAction(svcId, accessId) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const r = linkServiceCallProject(svcId, accessId, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not link." };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
  return { ok: true, call: r };
}

export async function assignSvcTechAction(svcId, techId, techName) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const r = assignServiceCallTech(svcId, techId ? Number(techId) : null, techName || null, { actor_role: user.role, actor_name: user.name });
  if (!r) return { ok: false, error: "Could not assign." };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath("/service-calls");
  return { ok: true, call: r };
}

// ---- Structured diagnosis (lib/svc-model.js) — autosave target. Any staff on the call. ----
export async function saveSvcDiagnosisAction(svcId, doc) {
  const { user, error } = await requireStaff();
  if (error) return { ok: false, error };
  const r = saveSvcDiagnosis(svcId, doc, { actor_role: user.role, actor_name: user.name });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, savedAt: new Date().toISOString() };
}

// Signatures bind to the current report fingerprint (diagnosis + invoice lines).
export async function signSvcReportAction(svcId, who, name) {
  const { user, error } = await requireStaff();
  if (error) return { ok: false, error };
  const r = signSvcReport(svcId, { who: who === "tech" ? "tech" : "customer", name: who === "tech" ? (name || user.name) : name, actor_role: user.role, actor_name: user.name });
  if (r.error) return { ok: false, error: r.error };
  revalidatePath(`/service-calls/${svcId}`);
  revalidatePath(`/service-call/${svcId}`);
  return { ok: true };
}
export async function unsignSvcReportAction(svcId) {
  const { user, error } = await requireStaff(["admin", "manager"]);
  if (error) return { ok: false, error };
  const r = unsignSvcReport(svcId, { actor_role: user.role, actor_name: user.name });
  if (r.error) return { ok: false, error: r.error };
  revalidatePath(`/service-calls/${svcId}`);
  return { ok: true };
}

export async function createFollowUpAction(svcId) {
  const { user, error } = await requireStaff();
  if (error) return { ok: false, error };
  const r = createFollowUpServiceCall(svcId, { actor_role: user.role, actor_name: user.name });
  if (r.error) return { ok: false, error: r.error };
  revalidatePath("/service-calls");
  return { ok: true, svcId: r.call.svc_id };
}

// Staff "+ Service Call": from a customer (CRM id) and optionally one of their projects. The call
// inherits the project's customer/contact/address/system; nothing is re-typed and no customer is created.
export async function createServiceCallAction({ customerId, projectAccessId, issue, callType, priority, category }) {
  const { user, error } = await requireStaff(["admin", "manager", "tech"]);
  if (error) return { ok: false, error };
  const text = String(issue || "").trim();
  if (!text) return { ok: false, error: "Describe the issue." };
  const proj = projectAccessId ? getJobByAccessId(projectAccessId) : null;
  const cust = customerId ? getCustomerSummary(customerId) : null;
  if (!proj && !cust) return { ok: false, error: "Pick a client or a project." };
  if (proj && cust && proj.customer_id && Number(proj.customer_id) !== Number(cust.id)) return { ok: false, error: "That project belongs to another client." };
  if (cust && !can(user.role, "customer.search")) return { ok: false, error: "Not authorized." };
  const call = createServiceCall({
    customer: proj?.customer || cust?.company || cust?.name,
    contact_name: proj?.contact_name || cust?.name || null,
    contact_email: proj?.contact_email || cust?.email || null,
    contact_phone: proj?.contact_phone || cust?.phone || null,
    address: proj?.address || null,
    project_access_id: proj?.access_id || null,
    issue: text.slice(0, 500),
    category: ["camera", "dropout", "nvr", "other"].includes(category) ? category : "other",
    priority: ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium",
    call_type: callType || "Service Call",
    customer_id: cust?.id || proj?.customer_id || null,
    actor_role: user.role, actor_name: user.name,
  });
  revalidatePath("/service-calls");
  return { ok: true, svcId: call.svc_id };
}
