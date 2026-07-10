import { revalidatePath } from "next/cache";
import { createLeadProject, getUserByEmail, createCustomerUser } from "../../../lib/db";

function capitalize(s) {
  return String(s || "").trim().split(/\s+/).map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function getPin(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-4) || "0000";
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null) ||
                 Object.fromEntries(await request.formData().catch(() => new FormData()));
    const name    = capitalize(String(body.name    || "").trim());
    const email   = String(body.email   || "").trim();
    const phone   = String(body.phone   || "").trim();
    const address = String(body.address || "").trim();
    const service = String(body.service || "").trim();
    const company = String(body.company || "").trim();
    if (!name && !email && !phone) {
      return Response.json({ ok: false, error: "Missing fields." }, { status: 400 });
    }
    const existingAccount = email ? !!getUserByEmail(email) : false;
    const { accessId, customerPin } = createLeadProject(name, email || null, phone || null, address, service, company || null);

    // Auto-create customer account if doesn't exist
    let accountCreated = false;
    let userPin = getPin(phone);
    if (!existingAccount && name) {
      try {
        createCustomerUser(name, email || null, phone || null);
        accountCreated = true;
      } catch (e) {
        // Email/phone may already exist, that's ok
      }
    }

    // A new project affects every list view — invalidate the cached pages so it shows up immediately.
    revalidatePath("/", "layout");
    return Response.json({ ok: true, accessId, customerPin, name, existingAccount, accountCreated, userPin });
  } catch (e) {
    console.error("demo error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
