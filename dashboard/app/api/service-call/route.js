import { revalidatePath } from "next/cache";
import {
  createServiceCall, getJobByAccessId,
  getUserByEmail, getUserByPhone, createCustomerUser, userHasPassword,
} from "../../../lib/db";

function capitalize(s) {
  return String(s || "").trim().split(/\s+/).map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")).join(" ");
}

// Public service-call intake — a customer reports an issue from the home page. Creates a real
// SVC service call (its own entity, never a project), auto-creates a customer account so they can
// track it, and hands back the Service Call ID + PIN. Mirrors /api/demo's account handling.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null) || {};
    const name    = capitalize(String(body.name    || "").trim());
    const email   = String(body.email   || "").trim();
    const phone   = String(body.phone   || "").trim();
    const address = String(body.address || "").trim();
    const issue   = String(body.issue   || "").trim();
    const category = String(body.category || "other").trim();
    const priority = ["low", "medium", "high", "urgent"].includes(body.priority) ? body.priority : "medium";
    const projectRef = String(body.project || "").trim();

    if (!name && !email && !phone) {
      return Response.json({ ok: false, error: "Tell us who you are so we can reach you." }, { status: 400 });
    }
    if (!issue) {
      return Response.json({ ok: false, error: "Describe the issue so we can help." }, { status: 400 });
    }

    // Link to an existing project only if the ref actually resolves — never fabricate the tie.
    const project = projectRef ? getJobByAccessId(projectRef) : null;

    const call = createServiceCall({
      customer: project?.customer || name,
      contact_name: name || null,
      contact_email: email || null,
      contact_phone: phone || null,
      address: address || project?.address || null,
      project_access_id: project?.access_id || null,
      issue, category, priority,
      actor_role: "customer", actor_name: name || null,
    });

    // Auto-create a customer account (idempotent) so they can log in and track — same as demo.
    const existingUser = (email ? getUserByEmail(email) : null) || (phone ? getUserByPhone(phone) : null);
    const existingAccount = !!(existingUser && userHasPassword(existingUser.id));
    if (!existingAccount && name) {
      try { createCustomerUser(name, email || null, phone || null); } catch (_) { /* dup email/phone is fine */ }
    }

    revalidatePath("/service-calls");
    return Response.json({
      ok: true,
      svcId: call.svc_id,
      pin: call.customer_pin,
      name: name.split(" ")[0] || "there",
      existingAccount,
    });
  } catch (e) {
    console.error("service-call intake error", e);
    return Response.json({ ok: false, error: "Server error. Please try again." }, { status: 500 });
  }
}
