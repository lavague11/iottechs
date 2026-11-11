import { verifyPasswordResetToken } from "../../lib/auth";
import { getUserById, passwordResetFingerprint } from "../../lib/db";
import ResetClient from "./reset-client";

// /reset?t=<token> — the destination of the emailed password-reset link. Fully validates server-side
// (signature + 30-min TTL + the single-use fingerprint + a live account) so an expired OR already-used
// link shows a clear message and a path to request a fresh one, instead of a form that fails on submit.
// The token is re-verified again on submit (completePasswordResetAction).
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }) {
  const sp = await searchParams;
  const token = String(sp?.t || "");
  const v = token ? await verifyPasswordResetToken(token) : null;
  let valid = false;
  if (v) {
    const u = getUserById(v.userId);
    valid = !!(u && !u.disabled && passwordResetFingerprint(v.userId) === v.fp);
  }
  return <ResetClient token={token} valid={valid} />;
}
