"use server";

import { getSessionUser } from "../../lib/session";
import { emailEnabled, sendEmail, renderEmail } from "../../lib/email";

// Admin-only diagnostic: send a real test email to the signed-in admin's own address so they can
// confirm delivery once RESEND_API_KEY is set. With no key it reports the disabled state instead
// of pretending to send. Never emails anyone but the admin who clicked it.
export async function sendTestEmailAction() {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, error: "Admins only." };
  const to = (user.email || "").trim();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Your account has no email address to send to." };
  }

  if (!emailEnabled()) {
    return { ok: true, enabled: false, to, skipped: true };
  }

  const html = renderEmail({
    heading: "Email is working",
    intro: `This is a test from your IOT TECHS dashboard, sent to ${to}.`,
    lines: ["If you're reading this, transactional email is configured correctly and customers will receive their notifications."],
    footNote: "You triggered this from Operations → Email. Safe to ignore.",
  });
  const res = await sendEmail({
    to,
    subject: "IOT TECHS — test email",
    html,
    text: `Email is working. This is a test from your IOT TECHS dashboard, sent to ${to}.`,
  });

  if (res.ok) return { ok: true, enabled: true, to, id: res.id || null };
  return { ok: false, enabled: true, to, error: res.error || "send-failed" };
}
