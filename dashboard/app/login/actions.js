"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyUserByCredential, recordLogin, recordLogout, getUserByEmail, getUserByPhone, userHasPassword, createCustomerUser, updateUser, loginTwoFactorEnabled, setLoginTwoFactor } from "../../lib/db";
import { twilioVerifyConfigured, toE164, startVerification, checkVerification } from "../../lib/twilio-verify";
import { makeToken, parseToken } from "../../lib/auth";

const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };
const maskPhone = (e164) => { const d = String(e164 || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(•••) •••-${d.slice(6)}` : "your number"; };

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

// ---- Phone + SMS 2FA login (the default) ----------------------------------
// Step 1: look up the account by phone; if 2FA is on AND Twilio is configured, text a code. When 2FA
// is off / unconfigured / the send fails, we hand back a `fallback` flag so the UI drops to password.
export async function start2faAction(phoneRaw) {
  const e164 = toE164(phoneRaw);
  if (!e164) return { error: "Enter a valid phone number." };
  const user = getUserByPhone(e164.slice(-10));   // match on the national 10 digits (stored without +1)
  if (!user) return { error: "No account found for that number.", noAccount: true };
  if (user.disabled) return { error: "This account has been disabled." };

  if (!(twilioVerifyConfigured() && loginTwoFactorEnabled())) {
    return { fallback: true, hasPassword: userHasPassword(user.id), phone: e164, masked: maskPhone(e164) };
  }
  const r = await startVerification(e164);
  if (!r.ok) return { error: r.error, fallback: true, hasPassword: userHasPassword(user.id), phone: e164, masked: maskPhone(e164) };
  return { sent: true, phone: e164, masked: maskPhone(e164) };
}

// Step 2: verify the texted code → sign in.
export async function verify2faAction(phoneRaw, code, next) {
  const e164 = toE164(phoneRaw);
  const user = e164 ? getUserByPhone(e164.slice(-10)) : null;
  if (!user) return { error: "Something went wrong — start over." };
  const r = await checkVerification(e164, code);
  if (!r.ok) return { error: "That code isn't right or has expired." };

  const { ip, ua } = await getRequestMeta();
  recordLogin(user.id, ip, ua);
  const token = await makeToken(user);
  const jar = await cookies();
  jar.set("iot_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  redirect(next && next !== "/" ? next : (ROLE_HOME[user.role] || "/dashboard"));
}

export async function resend2faAction(phoneRaw) {
  const e164 = toE164(phoneRaw);
  if (!e164) return { error: "Enter your number again." };
  if (!(twilioVerifyConfigured() && loginTwoFactorEnabled())) return { error: "Text codes are unavailable right now — use your password." };
  const r = await startVerification(e164);
  return r.ok ? { sent: true } : { error: r.error || "Couldn't resend the code." };
}

// Admin kill-switch: turn SMS 2FA on/off globally (e.g. Twilio is down → flip off, everyone uses password).
export async function setLoginTwoFactorAction(on) {
  const jar = await cookies();
  const sess = jar.get("iot_session")?.value ? await parseToken(jar.get("iot_session").value) : null;
  if (!sess || !["admin", "manager"].includes(sess.role)) return { error: "Not authorized." };
  setLoginTwoFactor(!!on, sess.name);
  return { ok: true, enabled: !!on };
}

export async function logoutAction() {
  const jar    = await cookies();
  const token  = jar.get("iot_session")?.value;
  const parsed = token ? await parseToken(token) : null;
  if (parsed?.id) recordLogout(Number(parsed.id));
  jar.delete("iot_session");
  redirect("/");
}
