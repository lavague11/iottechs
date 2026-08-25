// Outbound email — transactional customer notifications.
//
// Transport is Resend's REST API (no SDK/dependency — just fetch), chosen for a near-zero
// setup and generous free tier. The whole module is a SAFE NO-OP until RESEND_API_KEY is set:
// with no key it logs and returns {skipped:true}, so local dev and the initial deploy keep
// working with nothing to configure. Nothing here ever throws into a caller — email is a
// side effect, never a blocker for the action that triggered it.
//
// Env:
//   RESEND_API_KEY   secret — enables real sending. Unset = no-op.
//   EMAIL_FROM       "IOT TECHS <notify@yourdomain.com>" (default uses Resend's shared sender).
//   APP_URL          absolute base for links in emails, e.g. https://yourdomain.com

import { secretValue } from "./db";

const ENDPOINT = "https://api.resend.com/emails";

// Read config through the vault (app_secrets, Development ▸ API Keys) first, then env — same as
// the other integrations (tracking / sms). Putting RESEND_API_KEY in the vault now enables email.
function resendKey() {
  return secretValue("RESEND_API_KEY");
}

export function emailEnabled() {
  return !!resendKey();
}

function fromAddress() {
  return secretValue("EMAIL_FROM") || "IOT TECHS <onboarding@resend.dev>";
}

function fromEmailOnly() {
  const f = fromAddress();
  const m = f.match(/<([^>]+)>/);
  return (m ? m[1] : f).trim();
}

function appUrl() {
  return (secretValue("APP_URL") || "").replace(/\/+$/, "");
}

// Low-level send. Returns {ok,id} | {skipped:true} | {ok:false,error}. Never throws.
export async function sendEmail({ to, subject, html, text, replyTo, attachments }) {
  const recipient = String(to || "").trim();
  if (!recipient || !recipient.includes("@")) return { ok: false, error: "no-recipient" };
  if (!emailEnabled()) {
    console.log(`[email:skipped] no RESEND_API_KEY — would send "${subject}" to ${recipient}`);
    return { skipped: true };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [recipient],
        subject: String(subject || "").trim() || "Update from IOT TECHS",
        html,
        text: text || undefined,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email:error] ${res.status} sending to ${recipient}: ${body.slice(0, 300)}`);
      return { ok: false, error: `http_${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data?.id || null };
  } catch (e) {
    console.error(`[email:error] ${e?.message || e}`);
    return { ok: false, error: "network" };
  }
}

// ---- Branded template -------------------------------------------------------
// Email clients render dark backgrounds unreliably, so the shell is light with IOT's gold
// accent — table-based, all styles inline, no external assets (max deliverability).
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function renderEmail({ heading, intro, lines = [], ctaLabel, ctaUrl, footNote }) {
  const bodyLines = lines.filter(Boolean).map(
    (l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2f3a;">${esc(l)}</p>`
  ).join("");
  const cta = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
         <tr><td style="border-radius:8px;background:#0B0F1A;">
           <a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#C9A96E;text-decoration:none;border-radius:8px;">${esc(ctaLabel)}</a>
         </td></tr>
       </table>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec;">
          <tr><td style="background:#0B0F1A;padding:20px 28px;">
            <span style="font-size:16px;font-weight:700;letter-spacing:.14em;color:#C9A96E;">IOT&nbsp;TECHS</span>
          </td></tr>
          <tr><td style="padding:28px 28px 24px;">
            <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0B0F1A;">${esc(heading)}</h1>
            ${intro ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2f3a;">${esc(intro)}</p>` : ""}
            ${bodyLines}
            ${cta}
            ${footNote ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#8a909c;">${esc(footNote)}</p>` : ""}
          </td></tr>
          <tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eef0f3;">
            <p style="margin:0;font-size:12px;color:#9aa0ac;">IOT TECHS · Security & automation, professionally installed.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

function plainText({ heading, intro, lines = [], ctaLabel, ctaUrl }) {
  return [heading, "", intro, ...lines, ctaUrl ? `\n${ctaLabel}: ${ctaUrl}` : ""]
    .filter((s) => s !== undefined && s !== null)
    .join("\n");
}

// ---- Customer-facing helper -------------------------------------------------
// Resolve the project's customer contact and send. Import getJobByAccessId lazily so this
// module stays usable from the edge and doesn't pull the sync DB into unrelated bundles.
async function customerContact(accessId) {
  const { getJobByAccessId } = await import("./db.js");
  const p = getJobByAccessId(accessId);
  if (!p) return null;
  return {
    email: p.contact_email || null,
    name: p.contact_name || p.customer || "there",
    project: p,
  };
}

function projectLink(accessId) {
  const base = appUrl();
  return base ? `${base}/project/${accessId}` : null;
}

// Send a customer email for a project. content = {heading, intro, lines, ctaLabel}.
// Fire-and-forget friendly: awaited internally but callers may choose not to await.
export async function sendCustomerEmail(accessId, content) {
  const c = await customerContact(accessId);
  if (!c || !c.email) return { ok: false, error: "no-customer-email" };
  const ctaUrl = projectLink(accessId);
  const payload = {
    heading: content.heading,
    intro: content.intro,
    lines: content.lines || [],
    ctaLabel: ctaUrl ? (content.ctaLabel || "Open Project") : null,
    ctaUrl,
    footNote: content.footNote || "Reply to this email if you have any questions.",
  };
  return sendEmail({
    to: c.email,
    subject: content.subject || content.heading,
    html: renderEmail(payload),
    text: plainText(payload),
  });
}

// ---- Event copy -------------------------------------------------------------
// Customer-facing stages only — internal churn (qc, install scheduling, payout) never emails
// the customer. Keyed by the master stage key from lib/spec.js.
export const STAGE_EMAIL = {
  site_survey: {
    subject: "Your site survey is ready to review",
    heading: "Your site survey is ready",
    intro: "We’ve completed the walkthrough of your property.",
    lines: ["Take a look at the proposed camera placements and let us know they look right — one click to approve."],
    ctaLabel: "Review Survey",
  },
  proposal: {
    subject: "Your proposal is ready",
    heading: "Your proposal is ready to review",
    intro: "We’ve put together your system and pricing.",
    lines: ["Review the equipment and total, then approve when you’re ready to move forward."],
    ctaLabel: "Review Proposal",
  },
  approval_deposit: {
    subject: "Approve & secure your install date",
    heading: "One step to lock in your install",
    intro: "Your proposal is approved — the last step is signing and your deposit.",
    lines: ["Sign your agreement and submit the deposit to reserve your installation slot."],
    ctaLabel: "Sign & Pay Deposit",
  },
  payment: {
    subject: "Final balance is ready",
    heading: "Your install is complete — final balance",
    intro: "The work is done and your system is live.",
    lines: ["Your final balance is ready to settle whenever you are."],
    ctaLabel: "View Balance",
  },
  completion: {
    subject: "You’re all set — welcome to IOT TECHS",
    heading: "Everything’s wrapped up",
    intro: "Your project is complete.",
    lines: ["Your completion certificate and full record are available any time on your project page."],
    ctaLabel: "View Project",
  },
};

// Fire an email for a stage advance if that stage is customer-facing. No-op otherwise.
// Safe to call unconditionally after a stage move; never throws.
export async function emailStageAdvance(accessId, stageKey) {
  try {
    const copy = STAGE_EMAIL[stageKey];
    if (!copy) return { ok: false, error: "not-customer-facing" };
    return await sendCustomerEmail(accessId, copy);
  } catch (e) {
    console.error(`[email:stage] ${e?.message || e}`);
    return { ok: false, error: "exception" };
  }
}

// Proposal explicitly sent to the customer (distinct from the stage moving to "proposal").
export async function emailProposalReady(accessId) {
  try {
    return await sendCustomerEmail(accessId, STAGE_EMAIL.proposal);
  } catch (e) {
    console.error(`[email:proposal] ${e?.message || e}`);
    return { ok: false, error: "exception" };
  }
}

// ---- Appointment invitations ------------------------------------------------
// A booked survey/install visit emails the customer + assigned team a branded note AND a real
// calendar (.ics) attachment so it lands in Gmail/Apple Mail as an accept/decline invite. A
// cancellation re-sends the same event with METHOD:CANCEL so calendars drop it automatically.
const pad2 = (n) => String(n).padStart(2, "0");
function icsStamp(dateStr, timeStr) {
  const [h, m] = String(timeStr || "09:00").split(":").map(Number);
  const [y, mo, d] = String(dateStr || "2026-01-01").split("-").map(Number);
  return `${y}${pad2(mo)}${pad2(d)}T${pad2(h || 0)}${pad2(m || 0)}00`;
}
const icsEsc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");

// Floating local time (no TZID) — the event shows at the hour it was booked in the reader's calendar,
// matching how the in-app "Add to calendar" .ics behaves.
export function buildAppointmentIcs(ev, { method = "REQUEST", organizerEmail } = {}) {
  const start = icsStamp(ev.date, ev.time);
  const [h, m] = String(ev.time || "09:00").split(":").map(Number);
  const [y, mo, d] = String(ev.date || "2026-01-01").split("-").map(Number);
  const endD = new Date(y, mo - 1, d, h || 0, (m || 0) + (Number(ev.duration) || 60));
  const end = `${endD.getFullYear()}${pad2(endD.getMonth() + 1)}${pad2(endD.getDate())}T${pad2(endD.getHours())}${pad2(endD.getMinutes())}00`;
  const cancel = method === "CANCEL";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IOT TECHS//Scheduling//EN", "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${ev.id || `${ev.date}${ev.time}`}@iottechs`,
    `SEQUENCE:${cancel ? 1 : 0}`,
    organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : null,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${icsEsc(ev.title || "IOT TECHS Visit")}`,
    ev.location ? `LOCATION:${icsEsc(ev.location)}` : null,
    ev.notes ? `DESCRIPTION:${icsEsc(ev.notes)}` : null,
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function appointmentWhen(ev) {
  if (!ev?.date) return "";
  try {
    const day = new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    const [h, m] = String(ev.time || "").split(":").map(Number);
    if (Number.isNaN(h)) return day;
    const t = new Date(2000, 0, 1, h, m || 0).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day} · ${t}`;
  } catch { return ev.date; }
}

// Send the invite/cancellation. Recipients are resolved SERVER-SIDE (the project's customer + its
// assigned staff) — client-supplied emails are never trusted. Best-effort; never throws.
export async function sendAppointmentEmails(accessId, { verb, event } = {}) {
  try {
    if (!event?.date) return { ok: false, error: "no-event" };
    const { getJobByAccessId, getProjectAssignments } = await import("./db.js");
    const p = getJobByAccessId(accessId);
    if (!p) return { ok: false, error: "no-project" };
    const set = new Map();
    const add = (email, name) => {
      const e = String(email || "").trim();
      if (e && e.includes("@") && !set.has(e.toLowerCase())) set.set(e.toLowerCase(), { email: e, name: name || "" });
    };
    add(p.contact_email, p.contact_name || p.customer);                 // the customer
    try { getProjectAssignments(accessId).forEach((a) => add(a.user_email, a.user_name)); } catch {}  // assigned team
    const recipients = [...set.values()];
    if (!recipients.length) return { ok: false, error: "no-recipients" };

    const cancel = verb === "canceled";
    const noun = (event.kind === "install" || /install/i.test(event.title || "")) ? "installation" : "site survey";
    const whenLine = appointmentWhen(event);
    const ics = buildAppointmentIcs(event, { method: cancel ? "CANCEL" : "REQUEST", organizerEmail: fromEmailOnly() });
    const attachments = [{ filename: `iot-techs-${event.date || "visit"}.ics`, content: Buffer.from(ics, "utf8").toString("base64") }];
    const ctaUrl = projectLink(accessId);
    const subject = cancel ? `Appointment canceled — ${event.title || "IOT TECHS"}` : `Your ${noun} is scheduled`;
    const payload = {
      heading: cancel ? "Your appointment was canceled" : `Your ${noun} is scheduled`,
      intro: cancel ? "This appointment has been canceled. We'll be in touch to reschedule." : "Here are the details — add it to your calendar with the attached invite.",
      lines: [
        event.title ? `What: ${event.title}` : null,
        whenLine ? `When: ${whenLine}` : null,
        event.location ? `Where: ${event.location}` : null,
        event.notes ? `Notes: ${event.notes}` : null,
      ].filter(Boolean),
      ctaLabel: ctaUrl ? "Open Project" : null,
      ctaUrl,
      footNote: "Reply to this email if you have any questions.",
    };
    const html = renderEmail(payload);
    const text = plainText(payload);
    let sent = 0;
    for (const r of recipients) {
      const res = await sendEmail({ to: r.email, subject, html, text, attachments });
      if (res?.ok || res?.skipped) sent++;
    }
    return { ok: true, sent, recipients: recipients.length };
  } catch (e) {
    console.error(`[email:appointment] ${e?.message || e}`);
    return { ok: false, error: "exception" };
  }
}
