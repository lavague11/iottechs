"use server";

import { cookies } from "next/headers";
import { verifyPasswordResetToken, makeToken, sessionCookie } from "../../lib/auth";
import { getUserById, passwordResetFingerprint, resetUserPassword, recordLogin, customerSignLandingPath } from "../../lib/db";

const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };

// Finish a password reset from an emailed link. Re-verifies the signed token, confirms it hasn't already
// been used (the fingerprint of the current password hash must still match — setting the password changes
// it, so the link is single-use), sets the new password, and signs the person in. Never reveals which part
// failed beyond "invalid/expired" vs "already used".
export async function completePasswordResetAction(token, password, confirm) {
  if (!password || password.length < 6 || !/[A-Z]/.test(password)) return { error: "Password needs 6+ characters and a capital letter." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const v = await verifyPasswordResetToken(token);
  if (!v) return { error: "This reset link is invalid or has expired. Request a new one." };
  const user = getUserById(v.userId);
  if (!user || user.disabled) return { error: "This account isn't available." };
  if (passwordResetFingerprint(v.userId) !== v.fp) return { error: "This link has already been used. Request a new one." };

  resetUserPassword(v.userId, password);
  // Sign in with a fresh session (the new password fingerprint invalidates this link for any reuse).
  const fresh = getUserById(v.userId);
  const tok = await makeToken(fresh);
  const jar = await cookies();
  jar.set("iot_session", tok, sessionCookie(tok));   // 90-day persistent login
  try { recordLogin(fresh.id, "", ""); } catch { /* best-effort */ }
  const dest = customerSignLandingPath(fresh) || ROLE_HOME[fresh.role] || "/dashboard";
  return { ok: true, dest };   // client navigates (dodges the CDN redirect drop, like loginAction)
}
