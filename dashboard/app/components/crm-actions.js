"use server";
import { headers } from "next/headers";
import { searchCustomers, getCustomerSummary, findDuplicateCustomer, updateCustomerUser, getProjectsForCustomerId } from "../../lib/db";
import { serviceCodeLabel } from "../../lib/spec";
import { can } from "../../lib/roles";

// CRM lookups for the New Project form — server actions. Staff with customer.search only; a customer
// session is refused here, not just hidden in the UI. Nothing here creates a customer: creation happens
// in /api/demo together with the project (one request, one place).

// node:sqlite rows are null-prototype objects, which a server action can't serialize — send plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

async function staffTok(cap) {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw = cookie.split(";").find((c) => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  if (!raw) return null;
  const { parseToken } = await import("../../lib/auth");
  const tok = await parseToken(raw.trim());
  return tok?.role && can(tok.role, cap) ? tok : null;
}

export async function searchCustomersAction(q) {
  if (!(await staffTok("customer.search"))) return { ok: false, rows: [] };
  return { ok: true, rows: plain(searchCustomers(q, 8)) };
}

export async function customerSummaryAction(id) {
  if (!(await staffTok("customer.search"))) return { ok: false };
  const c = getCustomerSummary(id);
  return c ? { ok: true, customer: plain(c) } : { ok: false };
}

// Pre-flight for the New-client path (typed email/phone → the client that already owns it).
export async function checkDuplicateAction({ email, phone }) {
  if (!(await staffTok("customer.search"))) return { ok: false };
  return { ok: true, duplicate: plain(findDuplicateCustomer({ email, phone })) };
}

// The explicit "Update client record" affordance — the only way a project form touches a customer row.
export async function updateCustomerAction(id, fields) {
  if (!(await staffTok("customer.edit"))) return { ok: false, error: "Unauthorized." };
  const r = updateCustomerUser(id, fields);
  return r.error ? { ok: false, error: r.error } : { ok: true };
}

// A client's systems (projects), newest first — the "+ Service Call" picker. Companion service
// projects are excluded (a call never points at another call's shell).
export async function customerProjectsAction(id) {
  if (!(await staffTok("customer.search"))) return { ok: false, rows: [] };
  const rows = getProjectsForCustomerId(id).filter((p) => p.project_type !== "C")
    .map((p) => ({ access_id: p.access_id, service_code: p.service_code, service_label: serviceCodeLabel(p.service_code), address: p.address || "", stage: p.stage }));
  return { ok: true, rows: plain(rows) };
}
