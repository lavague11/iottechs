"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { getServiceCall, getUserById, addDiagnostic, signSvcInvoice, getSvcInvoice } from "../../../lib/db";

// A customer here is either PIN-only (iot_svc cookie scoped to this call) or a logged-in owner
// (email/phone matches the call's contact). Mirror the page's authorization exactly so an action
// can never do what the page wouldn't show.
async function authorizeCustomer(svcId) {
  const call = getServiceCall(svcId);
  if (!call) return { call: null, name: null };

  const jar = await cookies();
  const svcTok = jar.get("iot_svc")?.value;
  const svc = svcTok ? await parseSvcToken(svcTok) : null;
  if (svc && String(svc.svcId).toUpperCase() === String(call.svc_id).toUpperCase()) {
    return { call, name: call.contact_name || call.customer || "Customer" };
  }

  const user = await getSessionUser();
  if (user?.id && user.role === "customer") {
    const row = getUserById(user.id) || {};
    const digits = (s) => String(s || "").replace(/\D/g, "");
    const emailOwns = user.email && call.contact_email &&
      String(user.email).trim().toLowerCase() === String(call.contact_email).trim().toLowerCase();
    const phoneOwns = digits(row.phone).length >= 7 && digits(row.phone) === digits(call.contact_phone);
    if (emailOwns || phoneOwns) return { call, name: row.name || "Customer" };
  }
  return { call: null, name: null };
}

// Persist a customer self-diagnostic run (TRACE). Logs to the timeline and stamps the outcome route.
export async function saveCustomerDiagnosticAction(svcId, record) {
  const { call, name } = await authorizeCustomer(svcId);
  if (!call) return { ok: false, error: "Not authorized." };

  const steps = Array.isArray(record?.steps) ? record.steps.slice(0, 40) : [];
  const outcome = record?.outcome && typeof record.outcome === "object" ? record.outcome : null;
  addDiagnostic(call.svc_id, {
    mode: "customer",
    issue: String(record?.issue || "").slice(0, 200) || null,
    steps, outcome,
    started: record?.started || null, completed: record?.completed || null,
    actor_role: "customer", actor_name: name,
  });
  revalidatePath(`/service-call/${call.svc_id}`);
  revalidatePath(`/service-calls/${call.svc_id}`);
  return { ok: true };
}

// Customer approves & signs the sent invoice (typed name = signature, same convention as
// proposals). Only valid on a SENT, unsigned invoice — the helper enforces both.
export async function signSvcInvoiceAction(svcId, typedName) {
  const { call } = await authorizeCustomer(svcId);
  if (!call) return { ok: false, error: "Not authorized." };
  const name = String(typedName || "").trim();
  if (name.length < 2) return { ok: false, error: "Type your full name to sign." };
  const before = getSvcInvoice(call.svc_id);
  if (!before || before.status !== "sent") return { ok: false, error: "No invoice to sign." };
  if (before.signed_name) return { ok: false, error: "Already signed." };
  const inv = signSvcInvoice(call.svc_id, name);
  revalidatePath(`/service-call/${call.svc_id}`);
  revalidatePath(`/service-calls/${call.svc_id}`);
  return { ok: true, invoice: inv };
}
