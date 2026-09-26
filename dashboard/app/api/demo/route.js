import { revalidatePath } from "next/cache";
import { createLeadProject, getUserByEmail, getUserByPhone, createCustomerUser, userHasPassword } from "../../../lib/db";

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
    const propertyType = String(body.propertyType || "").trim();   // commercial (default) | residential
    if (!name && !email && !phone) {
      return Response.json({ ok: false, error: "Missing fields." }, { status: 400 });
    }
    // Start from a previous proposal (New Project → Start From → Previous Project): staff only — the
    // public inquiry form never carries it, and a forged one is simply ignored.
    let startFrom = null;
    if (body.startFrom && typeof body.startFrom === "object" && body.startFrom.sourceProposalId) {
      const { getSessionUser } = await import("../../../lib/session");
      const { can } = await import("../../../lib/roles");
      const u = await getSessionUser();
      if (!u?.id || !can(u.role, "proposal.reuse")) return Response.json({ ok: false, error: "Unauthorized." }, { status: 403 });
      startFrom = { sourceProposalId: Number(body.startFrom.sourceProposalId), options: body.startFrom.options || {}, actor: u.name || u.email || u.role, includeInternal: !!body.startFrom.options?.includeInternal && can(u.role, "cost.view") };
    }
    // Existing account = matched by email OR phone, and it already has a password. Detecting it
    // HERE (at info submit) lets the UI say "you already have an account — log in or reset your
    // password" instead of walking them into the create-password step and rejecting there.
    const existingUser = (email ? getUserByEmail(email) : null) || (phone ? getUserByPhone(phone) : null);
    const existingAccount = !!(existingUser && userHasPassword(existingUser.id));
    const { accessId, customerPin } = createLeadProject(name, email || null, phone || null, address, service, company || null, propertyType || null);

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

    // The copy happens HERE, after the project exists, through the one canonical clone service —
    // the form's contact / company / address / property / service stay authoritative (the clone only
    // brings proposal content). A clone failure never leaves a half-made project: report it, keep the project.
    let cloned = null, cloneError = null;
    if (startFrom) {
      const { cloneProposal } = await import("../../../lib/db");
      const res = cloneProposal({ sourceProposalId: startFrom.sourceProposalId, destAccessId: accessId, options: startFrom.options, actor: startFrom.actor, includeInternal: startFrom.includeInternal });
      if (res.error) cloneError = res.error; else cloned = res.source;
    }
    // A new project affects every list view — invalidate the cached pages so it shows up immediately.
    revalidatePath("/", "layout");
    return Response.json({ ok: true, accessId, customerPin, name, existingAccount, accountCreated, userPin, cloned, cloneError });
  } catch (e) {
    console.error("demo error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
