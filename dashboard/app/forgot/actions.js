"use server";

import { resetPasswordByPhoneLast4, getUserByEmail, getUserByPhone } from "../../lib/db";
import { toE164 } from "../../lib/sms-verify";
import { emailPasswordReset } from "../../lib/email";

// Email a reset link. Always returns the SAME generic result whether or not an account exists, so the
// form can't be used to discover which emails/phones are registered. The actual send (signed, single-use,
// 30-min link) only happens for a real, enabled account with an email on file.
export async function requestPasswordResetByEmailAction(identifierRaw) {
  const id = String(identifierRaw || "").trim();
  if (!id) return { error: "Enter your email or phone number." };
  try {
    let user = id.includes("@") ? getUserByEmail(id) : null;
    if (!user && !id.includes("@")) { const e164 = toE164(id); if (e164) user = getUserByPhone(e164.slice(-10)); }
    if (user && user.email && !user.disabled) {
      await emailPasswordReset({ userId: user.id, email: user.email, name: user.name }).catch(() => {});
    }
  } catch { /* never reveal failure specifics */ }
  return { ok: true, sent: true };
}

// Self-service reset: identity proven by the last 4 digits of the phone on file (the same
// number that IS the customer's login PIN). No email round-trip needed, which keeps it working
// even where transactional email isn't configured.
export async function resetPasswordAction({ identifier, last4, password, confirm }) {
  if (password !== confirm) return { error: "Passwords don't match." };
  try {
    return resetPasswordByPhoneLast4(identifier, last4, password);
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
