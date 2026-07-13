"use server";

import { resetPasswordByPhoneLast4 } from "../../lib/db";

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
