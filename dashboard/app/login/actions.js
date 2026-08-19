"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyUserByCredential, recordLogin, recordLogout, getUserByEmail, getUserByPhone, userHasPassword, createCustomerUser, updateUser } from "../../lib/db";
import { makeToken, parseToken } from "../../lib/auth";

async function getRequestMeta() {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "127.0.0.1";
  const ua = hdrs.get("user-agent") || null;
  return { ip, ua };
}

export async function loginAction(formData) {
  const identifier = formData.get("identifier") || formData.get("email");
  const password   = formData.get("password");
  const next       = formData.get("next") || "";

  const user = verifyUserByCredential(identifier, password);
  if (user?.disabled) return { error: "This account has been disabled. Contact an administrator." };
  if (!user) return { error: "Invalid username, email, or password." };

  const { ip, ua } = await getRequestMeta();
  recordLogin(user.id, ip, ua);

  const token = await makeToken(user);
  const jar = await cookies();
  jar.set("iot_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };
  const dest = next && next !== "/" ? next : (ROLE_HOME[user.role] || "/dashboard");
  redirect(dest);
}

// Self-serve account creation from the dedicated /login portal. Creates a customer account (or
// claims a password-less lead the office already has on file), sets the password, then signs them
// in immediately — no bounce to the marketing page.
export async function signupAction(formData) {
  const name     = String(formData.get("name") || "").trim();
  const email    = String(formData.get("email") || "").trim();
  const phone    = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm  = String(formData.get("confirm") || "");
  const next     = formData.get("next") || "";

  if (!name) return { error: "Please enter your name." };
  if (!email && !phone) return { error: "Enter an email or phone number." };
  if (password.length < 6 || !/[A-Z]/.test(password)) return { error: "Password needs 6+ characters and a capital letter." };
  if (password !== confirm) return { error: "Passwords don't match." };

  // Match an existing record by email then phone. An account that already has a password can't be
  // re-created here — that would hand it to whoever posted the form.
  let user = email ? getUserByEmail(email) : null;
  if (!user && phone) user = getUserByPhone(phone);
  if (user && userHasPassword(user.id)) return { error: "You already have an account — sign in instead." };
  if (!user) {
    createCustomerUser(name, email || null, phone || null);
    user = email ? getUserByEmail(email) : (phone ? getUserByPhone(phone) : null);
  }
  if (!user) return { error: "Couldn't create your account. Please try again." };
  updateUser(user.id, { password });

  const { ip, ua } = await getRequestMeta();
  recordLogin(user.id, ip, ua);
  const token = await makeToken(user);
  const jar = await cookies();
  jar.set("iot_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  const dest = next && next !== "/" ? next : "/my-projects";
  redirect(dest);
}

export async function logoutAction() {
  const jar    = await cookies();
  const token  = jar.get("iot_session")?.value;
  const parsed = token ? await parseToken(token) : null;
  if (parsed?.id) recordLogout(Number(parsed.id));
  jar.delete("iot_session");
  redirect("/");
}
