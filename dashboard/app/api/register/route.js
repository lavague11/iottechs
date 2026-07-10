import { getUserByEmail, getUserByPhone, updateUser, createCustomerUser, setProjectCustomerPin, userHasPassword, getJobByAccessId } from "../../../lib/db";

// A PIN may only be attached to a project the registrant actually owns: the email or
// phone they registered with must match the project's contact info. Without this,
// anyone could claim any project ID and set its customer PIN.
function ownsProject(accessId, email, phone) {
  const project = getJobByAccessId(accessId);
  if (!project) return false;
  const em = String(email || "").trim().toLowerCase();
  const pj = String(project.contact_email || "").trim().toLowerCase();
  if (em && pj && em === pj) return true;
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const ph = digits(phone), pp = digits(project.contact_phone);
  return !!(ph && pp && ph === pp);
}

export async function POST(request) {
  const { email, phone, name, password, pin, accessId } = await request.json();

  if (!password)
    return Response.json({ ok: false, error: "Password is required." }, { status: 400 });
  if (password.length < 6)
    return Response.json({ ok: false, error: "Password must be at least 6 characters." }, { status: 400 });
  if (pin && !/^\d{4}$/.test(pin))
    return Response.json({ ok: false, error: "PIN must be exactly 4 digits." }, { status: 400 });
  if (!email && !phone)
    return Response.json({ ok: false, error: "Email or phone is required." }, { status: 400 });

  // Find user: email first, phone fallback
  let user = email ? getUserByEmail(email) : null;
  if (!user && phone) user = getUserByPhone(phone);

  // Accounts that already have a password can never be re-registered — that path
  // would overwrite the password and hand the account to whoever posted the form.
  if (user && userHasPassword(user.id))
    return Response.json(
      { ok: false, existingAccount: true, error: "You already have an account. Log in to view your project." },
      { status: 409 }
    );

  // If no account yet but we have enough info, create one
  if (!user) {
    if (!email && !phone)
      return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
    createCustomerUser(name || "Customer", email || null, phone || null);
    user = email ? getUserByEmail(email) : getUserByPhone(phone);
  }

  if (!user)
    return Response.json({ ok: false, error: "Could not create account." }, { status: 500 });

  updateUser(user.id, { password });
  if (pin && accessId) {
    if (!ownsProject(accessId, email, phone))
      return Response.json({ ok: false, error: "That project isn't linked to this email or phone." }, { status: 403 });
    setProjectCustomerPin(accessId, pin);
  }

  return Response.json({ ok: true });
}
