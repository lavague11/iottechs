// Work order messages and sweeps (docs/WORK_ORDERS.md, Stage 4 follow-up).
//
// Two things the office never has to remember:
//   • The customer is ASKED to sign off when the work finishes, chased once a day later, and the job
//     can be closed without them. Sign-off is a request, not a gate.
//   • A technician who checked in and never ended their day is nudged 12 hours after THAT arrival —
//     once per check-in, not on a clock. A crew that starts at 7am is reminded at 7pm; one that starts
//     at 2pm is reminded at 2am… which is why the reminder also goes to the office, who can close it.
//
// Every send is best-effort: a text or an email that fails must never undo the thing that asked for it.
// Email is dormant until RESEND_API_KEY; SMS until TWILIO_SMS_FROM. Both say so rather than pretending.
import {
  woNeedingSignoffReminder, stampWoSignoffReminded, woRow, getWorkOrderDoc,
  woCheckinsNeedingEodReminder, stampWoCheckinReminded,
  getJobByAccessId, getCustomerUserForProject, notifyRoles, createNotification, logProjectEvent,
} from "./db.js";
import { sendCustomerEmail, emailEnabled } from "./email.js";
import { sendSms, smsEnabled } from "./sms.js";
import { SUPPORT_PHONE } from "./nap.js";
import { secretValue } from "./db.js";

export const EOD_AFTER_HOURS = 12;        // nudge this long after the technician arrived
export const SIGNOFF_CHASE_HOURS = 24;    // chase the customer this long after the ask

// The same base the emails use (APP_URL in the vault, the live domain as the fallback), so a texted
// link and an emailed one can never point at different places.
const portalLink = (accessId) => `${(secretValue("APP_URL") || "https://iot-techs.com").replace(/\/+$/, "")}/project/${accessId}`;

// The ask and the chase are the same message with a different opening line, so they cannot drift.
export async function sendSignoffRequest(accessId, { reminder = false } = {}) {
  const job = getJobByAccessId(accessId);
  if (!job) return { ok: false, reason: "no-project" };
  const link = portalLink(accessId);
  const name = job.contact_name || job.customer || "there";
  const lead = reminder
    ? "Just a reminder — your installation is finished and we'd like your sign-off."
    : "Your installation is finished.";
  const out = { email: null, sms: null };

  if (emailEnabled()) {
    out.email = await sendCustomerEmail(accessId, {
      subject: reminder ? "Reminder: sign off your installation" : "Your installation is complete",
      heading: reminder ? "Still waiting on your sign-off" : "Your installation is complete",
      lines: [
        `Hi ${name},`,
        `${lead} Please open your project and sign off to confirm the work is complete.`,
        `If anything isn't right, reply to this email or call ${SUPPORT_PHONE} and we'll come back out.`,
      ],
      // sendCustomerEmail builds the link itself from `open` — it is the one place project URLs are made.
      open: "closeout",
      ctaLabel: "Sign off",
    }).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
  } else {
    out.email = { ok: false, reason: "email-not-configured" };
  }

  const phone = job.contact_phone || null;
  if (phone && smsEnabled()) {
    out.sms = await sendSms({ to: phone, body: `IOT TECHS: ${lead} Sign off here: ${link}?view=closeout` });
  } else {
    out.sms = { ok: false, reason: phone ? "sms-not-configured" : "no-phone" };
  }

  // In-app, always — it is the one channel that needs no key, and it is what the customer sees when
  // they next open the portal.
  const cust = getCustomerUserForProject(accessId);
  if (cust?.id) {
    createNotification({
      user_id: cust.id, type: "wo_signoff",
      title: reminder ? "Reminder: sign off your installation" : "Your installation is complete",
      body: "Open your project to confirm the work is complete.",
      link: `/project/${accessId}?view=closeout`,
    });
  }
  try {
    logProjectEvent(accessId, {
      kind: "request",
      label: `${reminder ? "Sign-off reminder" : "Sign-off requested"} · ${[out.email?.ok && "email", out.sms?.ok && "text", cust?.id && "portal"].filter(Boolean).join(" + ") || "portal only"}`.slice(0, 300),
      actor: "System",
    });
  } catch { /* the log is not worth failing the send for */ }
  return { ok: true, ...out };
}

// Chase every work order whose customer was asked a day ago and still hasn't signed. Claim-once per
// work order (the stamp), so an hourly sweep sends exactly one chase.
export async function sweepSignoffReminders({ now = new Date() } = {}) {
  let sent = 0;
  for (const row of woNeedingSignoffReminder(SIGNOFF_CHASE_HOURS, now)) {
    if (!stampWoSignoffReminded(row.id)) continue;
    await sendSignoffRequest(row.project_access_id, { reminder: true });
    sent += 1;
  }
  return { ok: true, sent };
}

// Nudge a technician 12 hours after they arrived if their day is still open, and tell the office so
// they can close it. One per check-in: the stamp is the claim, and it is taken before the send.
export async function sweepEndOfDayReminders({ now = new Date() } = {}) {
  let sent = 0;
  for (const c of woCheckinsNeedingEodReminder(EOD_AFTER_HOURS, now)) {
    if (!stampWoCheckinReminded(c.id)) continue;
    const link = `/project/${c.project_access_id}?view=workorder`;
    const where = c.company_name || c.customer || c.project_access_id;
    if (c.user_id != null) {
      createNotification({
        user_id: c.user_id, type: "wo_eod",
        title: "End your day",
        body: `You checked in at ${where} ${EOD_AFTER_HOURS} hours ago and haven't closed the day. Closing it banks your pay.`,
        link,
      });
      if (c.phone && smsEnabled()) {
        await sendSms({ to: c.phone, body: `IOT TECHS: you're still checked in at ${where}. Tap End of day to bank today's work.` });
      }
    }
    notifyRoles(["admin", "manager"], {
      type: "wo_eod_open",
      title: `${c.name} hasn't ended their day`,
      body: `${c.name} checked in at ${where} ${EOD_AFTER_HOURS} hours ago and hasn't closed the day. You can close it for them.`,
      link,
    }, c.user_id ?? null);
    sent += 1;
  }
  return { ok: true, sent };
}
