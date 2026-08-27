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
import { makeApptToken } from "./auth";

const ENDPOINT = "https://api.resend.com/emails";

// Read config through the vault (app_secrets, Development ▸ API Keys) first, then env — same as
// the other integrations (tracking / sms). Putting RESEND_API_KEY in the vault now enables email.
function resendKey() {
  return secretValue("RESEND_API_KEY");
}

export function emailEnabled() {
  return !!resendKey();
}

// Sender. Defaults to the IOT TECHS sending subdomain (send.iot-techs.com) so email works the moment
// that domain verifies in Resend — no vault step needed. A vault EMAIL_FROM still overrides if set.
// NOTE: Resend rejects a domain until it shows "Verified"; before then, sends fail (see Resend → Logs).
function fromAddress() {
  return secretValue("EMAIL_FROM") || "IOT TECHS <notify@send.iot-techs.com>";
}

function fromEmailOnly() {
  const f = fromAddress();
  const m = f.match(/<([^>]+)>/);
  return (m ? m[1] : f).trim();
}

function appUrl() {
  // Fall back to the live domain so email links (project №, confirm, reschedule, open project)
  // never render dead or as plain text when the APP_URL vault value is momentarily unset.
  return (secretValue("APP_URL") || "https://iot-techs.com").replace(/\/+$/, "");
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
            <span style="font-size:16px;font-weight:700;letter-spacing:.14em;color:#C9A96E;"><a href="https://iot-techs.com/go" style="color:inherit;text-decoration:none;">IOT&nbsp;TECHS</a></span>
          </td></tr>
          <tr><td style="padding:28px 28px 24px;">
            <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0B0F1A;">${esc(heading)}</h1>
            ${intro ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2f3a;">${esc(intro)}</p>` : ""}
            ${bodyLines}
            ${cta}
            ${footNote ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#8a909c;">${esc(footNote)}</p>` : ""}
          </td></tr>
          <tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eef0f3;">
            <p style="margin:0;font-size:12px;color:#9aa0ac;">IOT TECHS · Make tomorrow safer today.</p>
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

// Email the office (admin/manager) about a customer action — e.g. an appointment confirmation or a
// reschedule/cancel request. Best-effort; never throws. Uses the branded template.
export async function sendOfficeEmail({ subject, heading, lines = [], accessId } = {}) {
  try {
    const { getUserEmailsByRoles } = await import("./db.js");
    const recips = getUserEmailsByRoles(["admin", "manager"]).filter((u) => u.email && u.email.includes("@"));
    if (!recips.length) return { ok: false, error: "no-office" };
    const ctaUrl = accessId ? projectLink(accessId) : null;
    const payload = { heading, intro: "", lines: (lines || []).filter(Boolean), ctaLabel: ctaUrl ? "Open Project" : null, ctaUrl, footNote: "You're receiving this as an IOT TECHS admin/manager." };
    const html = renderEmail(payload);
    const text = plainText(payload);
    let sent = 0, i = 0;
    const seen = new Set();
    for (const u of recips) {
      const e = u.email.toLowerCase();
      if (seen.has(e)) continue; seen.add(e);
      if (i++ > 0) await new Promise((res) => setTimeout(res, 600));  // Resend rate limit
      const r = await sendEmail({ to: u.email, subject, html, text });
      if (r?.ok || r?.skipped) sent++;
    }
    return { ok: true, sent };
  } catch (e) { console.error(`[email:office] ${e?.message || e}`); return { ok: false, error: "exception" }; }
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
export function buildAppointmentIcs(ev, { method = "REQUEST", organizerEmail, attendees = [], sequence = 0, accessId = "" } = {}) {
  const start = icsStamp(ev.date, ev.time);
  const [h, m] = String(ev.time || "09:00").split(":").map(Number);
  const [y, mo, d] = String(ev.date || "2026-01-01").split("-").map(Number);
  const endD = new Date(y, mo - 1, d, h || 0, (m || 0) + (Number(ev.duration) || 60));
  const end = `${endD.getFullYear()}${pad2(endD.getMonth() + 1)}${pad2(endD.getDate())}T${pad2(endD.getHours())}${pad2(endD.getMinutes())}00`;
  const cancel = method === "CANCEL";
  // ATTENDEE lines with RSVP=TRUE are what make Gmail/Apple treat this as an INVITE (auto-add +
  // Yes/Maybe/No buttons) rather than a plain "add to calendar" attachment.
  const attLines = (attendees || []).filter((a) => a?.email).map((a) =>
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${a.name ? `;CN=${icsEsc(a.name)}` : ""}:mailto:${a.email}`);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IOT TECHS//Scheduling//EN", "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${accessId ? `${accessId}-` : ""}${ev.id || `${ev.date}${ev.time}`}@iottechs`,
    `SEQUENCE:${sequence}`,
    organizerEmail ? `ORGANIZER;CN=IOT TECHS:mailto:${organizerEmail}` : null,
    ...attLines,
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

function apptDateParts(dateStr) {
  try {
    const dt = new Date(`${dateStr}T00:00:00`);
    return {
      mon: dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: dt.getDate(),
      weekday: dt.toLocaleDateString("en-US", { weekday: "long" }),
    };
  } catch { return { mon: "", day: "", weekday: "" }; }
}
function apptTimeRange(time, duration) {
  try {
    const [h, m] = String(time || "09:00").split(":").map(Number);
    const start = new Date(2000, 0, 1, h, m || 0);
    const end = new Date(start.getTime() + (Number(duration) || 60) * 60000);
    const f = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${f(start)} – ${f(end)}`;
  } catch { return time || ""; }
}
function mapsUrl(address) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address || "");
}
// Server-side Google Calendar "add" link (UTC times; server TZ is Eastern so the conversion is right).
function gcalUrl(ev) {
  try {
    const [h, m] = String(ev.time || "09:00").split(":").map(Number);
    const [y, mo, d] = String(ev.date || "2026-01-01").split("-").map(Number);
    const start = new Date(y, mo - 1, d, h || 0, m || 0);
    const end = new Date(start.getTime() + (Number(ev.duration) || 60) * 60000);
    const fmt = (dt) => dt.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
    const params = new URLSearchParams({ action: "TEMPLATE", text: ev.title || "IOT TECHS Visit", dates: `${fmt(start)}/${fmt(end)}`, location: ev.location || "", details: ev.notes || "" });
    return "https://calendar.google.com/calendar/render?" + params.toString();
  } catch { return ""; }
}

// Chic editorial appointment email (Playfair serif, warm cream, gold hairline). Table-based + MSO
// conditionals for Outlook; dynamic date/time/service/location(→maps)/technician + Confirm (calendar),
// Reschedule (request page) buttons. One template for scheduled / rescheduled / reminder / canceled.
const SUPPORT_PHONE = "(917) 727-0081", SUPPORT_TEL = "+19177270081";
export function renderAppointmentEmail({ verb, event, noun, projectNo, tech, ctaUrl, changeUrl, internal = false, customerName = "" }) {
  const cancel = verb === "canceled", reminder = verb === "reminder", updated = verb === "updated";
  const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
  const service = (event.title && event.title.includes("—")) ? event.title.split("—").pop().trim() : cap(noun || "Appointment");
  const eyebrow = internal
    ? (cancel ? `Assignment Canceled` : reminder ? `Assignment Reminder` : updated ? `Assignment Rescheduled` : `You're Assigned`)
    : (cancel ? `Your ${service} Was Canceled` : reminder ? `Appointment Reminder` : updated ? `Your ${service} Was Rescheduled` : `Your ${service} Is Scheduled`);
  const _d = new Date(`${event.date}T00:00:00`);
  const bigDate = Number.isNaN(_d.getTime()) ? String(event.date || "") : _d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const range = apptTimeRange(event.time, event.duration);
  const gcal = cancel ? "" : gcalUrl(event);
  // CONFIRM records the customer's RSVP (they'll attend) via the /appt page; falls back to the
  // calendar link if there's no token URL.
  const confirmUrl = changeUrl ? `${changeUrl}?do=confirm` : (gcal || ctaUrl);
  const loc = String(event.location || "");
  const ci = loc.indexOf(",");
  const street = ci > 0 ? loc.slice(0, ci).trim() : loc;
  const cityLine = ci > 0 ? loc.slice(ci + 1).replace(/,?\s*USA\s*$/i, "").trim() : "";
  const maps = loc ? mapsUrl(loc) : "";
  const techName = (tech && String(tech).trim()) || "To be assigned";
  const detail = (label, valueHtml) => valueHtml
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
         <tr><td style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:10px; font-weight:bold; letter-spacing:3px; color:#B4945C; text-transform:uppercase; padding-bottom:6px;">${esc(label)}</td></tr>
         <tr><td class="serif" style="font-size:17px; color:#161821; line-height:1.5; padding-bottom:20px;">${valueHtml}</td></tr>
       </table>
       <div style="height:1px; background-color:#EAE4D8; font-size:0; line-height:0; margin-bottom:20px;">&nbsp;</div>`
    : "";
  const locHtml = street
    ? (maps ? `<a href="${esc(maps)}" style="color:#161821; text-decoration:none;">${esc(street)}${cityLine ? `<br><span style="font-size:15px; color:#161821;">${esc(cityLine)}</span>` : ""}</a>`
            : `${esc(street)}${cityLine ? `<br><span style="font-size:15px; color:#161821;">${esc(cityLine)}</span>` : ""}`)
    : "";
  const button = (href, label, primary) => `<td align="center" valign="middle" style="padding:0 7px;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:52px;v-text-anchor:middle;width:${primary ? 190 : 168}px;" arcsize="0%" strokecolor="${primary ? "#161821" : "#C9BFA8"}" fillcolor="${primary ? "#161821" : "#FBFAF6"}"><w:anchorlock/><center style="color:${primary ? "#F0E7D4" : "#4A4636"};font-family:Georgia,serif;font-size:11px;letter-spacing:4px;">${esc(label.toUpperCase())}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="${esc(href)}" style="display:inline-block; background-color:${primary ? "#161821" : "#FBFAF6"}; color:${primary ? "#F0E7D4" : "#4A4636"}; font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:11px; font-weight:normal; letter-spacing:4px; text-decoration:none; padding:17px ${primary ? 42 : 30}px; text-transform:uppercase; border:1px solid ${primary ? "#161821" : "#C9BFA8"};">${esc(label)}</a><!--<![endif]-->
    </td>`;
  const confirmLabel = internal ? "Available" : "Confirm";
  const ctaCells = cancel ? "" : [confirmUrl ? button(confirmUrl, confirmLabel, true) : "", changeUrl ? button(changeUrl, "Reschedule", false) : ""].join("");
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
  <title>${esc(eyebrow)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body,table,td,a{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td{ mso-table-lspace:0pt; mso-table-rspace:0pt; } table{ border-collapse:collapse !important; }
    body{ margin:0 !important; padding:0 !important; width:100% !important; }
    a[x-apple-data-detectors]{ color:inherit !important; text-decoration:none !important; }
    .serif{ font-family:'Bricolage Grotesque','Instrument Sans',Helvetica,Arial,sans-serif; }
    @media screen and (max-width:600px){ .container{ width:100% !important; } .px{ padding-left:30px !important; padding-right:30px !important; } .date-serif{ font-size:30px !important; } }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#EDE8DE;">
  <div style="display:none; font-size:1px; color:#EDE8DE; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">${esc(bigDate)}${range ? ` at ${esc(range)}` : ""}${street ? ` — ${esc(street)}` : ""}</div>
  <center style="width:100%; background-color:#EDE8DE;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#EDE8DE;"><tr><td align="center" style="padding:44px 14px;">
      <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="600" style="width:600px; max-width:600px; background-color:#FBFAF6; border:1px solid #E3DDD0;">
        <tr><td align="center" style="padding:38px 50px 30px 50px;" class="px">
          <div class="serif" style="font-size:23px; font-weight:600; letter-spacing:8px; color:#161821;"><a href="https://iot-techs.com/go" style="color:inherit;text-decoration:none;">IOT&nbsp;TECHS</a></div>
          <div style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:10px; letter-spacing:4px; color:#A79A80; margin-top:10px; text-transform:uppercase;">Security &amp; Automation</div>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin-top:22px;"><tr><td style="width:70px; height:1px; font-size:0; line-height:0; background-color:#B4945C;">&nbsp;</td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:6px 50px 4px 50px;" class="px"><div style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:11px; font-weight:bold; letter-spacing:4px; color:#B4945C; text-transform:uppercase;">${esc(eyebrow)}</div></td></tr>
        <tr><td align="center" style="padding:14px 50px 4px 50px;" class="px">
          <div class="serif date-serif" style="font-size:34px; font-weight:500; color:#161821; line-height:1.25;">${esc(bigDate)}</div>
          ${range ? `<div class="serif" style="font-size:19px; font-weight:400; font-style:italic; color:#161821; margin-top:8px;">${esc(range)}</div>` : ""}
        </td></tr>
        <tr><td style="padding:34px 62px 6px 62px;" class="px">
          ${detail("Project", ctaUrl ? `<a href="${esc(ctaUrl)}" style="color:#161821; text-decoration:none; border-bottom:1px solid #D8CFBB;">&#8470;&nbsp;${esc(projectNo || "")}</a>` : `&#8470;&nbsp;${esc(projectNo || "")}`)}
          ${internal && customerName ? detail("Customer", esc(customerName)) : ""}
          ${detail("Service", esc(service))}
          ${detail("Location", locHtml)}
          ${event.notes ? detail("Notes", esc(event.notes)) : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:10px; font-weight:bold; letter-spacing:3px; color:#B4945C; text-transform:uppercase; padding-bottom:6px;">Technician</td></tr>
            <tr><td class="serif" style="font-size:17px; color:#161821; padding-bottom:4px;">${esc(techName)}</td></tr>
          </table>
        </td></tr>
        ${ctaCells ? `<tr><td align="center" style="padding:34px 50px 8px 50px;" class="px"><table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>${ctaCells}</tr></table></td></tr>` : ""}
        ${gcal ? `<tr><td align="center" style="padding:12px 50px 6px 50px;" class="px"><div style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; letter-spacing:1px; color:#A79A80;"><a href="${esc(gcal)}" style="color:#8A8069; text-decoration:none; border-bottom:1px solid #D8CFBB; padding-bottom:2px;">Add to calendar</a></div></td></tr>` : ""}
        <tr><td align="center" style="padding:30px 62px 40px 62px;" class="px"><div style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; color:#8A8069; line-height:1.7;">${internal
            ? (cancel ? "This assignment was canceled." : "You're assigned to this job — tap <b>Available</b> to confirm you'll be there.<br>Can't make it? Tap Reschedule or reply to this note.")
            : (cancel ? "This appointment has been canceled.<br>Reply to this note or call" : "To reschedule or with any questions, simply reply to this note<br>or call")}${internal ? "" : ` <a href="tel:${SUPPORT_TEL}" style="color:#161821; text-decoration:none; border-bottom:1px solid #D8CFBB;">${SUPPORT_PHONE}</a>.`}</div></td></tr>
        <tr><td align="center" style="background-color:#161821; padding:30px 50px;" class="px">
          <div class="serif" style="font-size:14px; font-weight:500; letter-spacing:5px; color:#FBFAF6;"><a href="https://iot-techs.com/go" style="color:inherit;text-decoration:none;">IOT&nbsp;TECHS</a></div>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 12px auto;"><tr><td style="width:40px; height:1px; background-color:#B4945C; font-size:0; line-height:0;">&nbsp;</td></tr></table>
          <div style="font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:10px; letter-spacing:2px; color:#8A8B95; line-height:1.9; text-transform:uppercase;">Cameras &middot; AV &middot; Networking &middot; Low-Voltage<br>Authorized through ADT &amp; SafeStreets</div>
        </td></tr>
      </table>
    </td></tr></table>
  </center>
</body>
</html>`;
}

// Send the invite/cancellation. Recipients are resolved SERVER-SIDE (the project's customer + its
// assigned staff) — client-supplied emails are never trusted. Best-effort; never throws.
export async function sendAppointmentEmails(accessId, { verb, event, extraEmails = [] } = {}) {
  try {
    if (!event?.date) return { ok: false, error: "no-event" };
    const { getJobByAccessId, getProjectAssignments, getUserByEmail } = await import("./db.js");
    const p = getJobByAccessId(accessId);
    if (!p) return { ok: false, error: "no-project" };
    const set = new Map();
    const add = (email, name, role) => {
      const e = String(email || "").trim();
      if (!e || !e.includes("@")) return;
      const key = e.toLowerCase();
      if (set.has(key)) return;
      // A guest with no name we recognize → resolve their real identity from the users table so
      // their confirm link greets/records THEM, not the customer (empty name used to fall back to
      // the customer's name on the confirm page).
      if ((!name || !role || role === "guest")) {
        try { const u = getUserByEmail(e); if (u) { name = name || u.name || u.username || ""; role = (role && role !== "guest") ? role : (u.role || "team"); } } catch {}
      }
      set.set(key, { email: e, name: name || "", role: role || "" });
    };
    add(p.contact_email, p.contact_name || p.customer, "customer");                        // the customer
    try { getProjectAssignments(accessId).forEach((a) => add(a.user_email, a.user_name, a.role || "team")); } catch {}  // assigned team/tech
    (Array.isArray(extraEmails) ? extraEmails : []).forEach((e) => add(e, "", "guest"));    // staff booker + typed guest invitees
    const recipients = [...set.values()];
    if (!recipients.length) return { ok: false, error: "no-recipients" };

    const cancel = verb === "canceled";
    const reminder = verb === "reminder";
    const updated = verb === "updated";
    const noun = (event.kind === "install" || /install/i.test(event.title || "")) ? "installation" : "site survey";
    const whenLine = appointmentWhen(event);
    const method = cancel ? "CANCEL" : "REQUEST";
    // Inbound RSVP scraping (opt-in): when RSVP_INBOUND_DOMAIN is set in the vault, address the
    // calendar ORGANIZER to a plus-tagged, signed rsvp+<token>@<domain>. Invitees' Yes/No/Maybe
    // replies land there, where /api/rsvp-inbound decodes the token → the event. Dormant (falls back
    // to the plain from-address) until the domain is configured, so existing invites are unaffected.
    let organizerEmail = fromEmailOnly(), icsAccessId = "";
    try {
      const rsvpDomain = secretValue("RSVP_INBOUND_DOMAIN");
      if (rsvpDomain && event.id != null) {
        const { makeRsvpToken } = await import("./auth.js");
        organizerEmail = `rsvp+${await makeRsvpToken(accessId, event.id)}@${rsvpDomain}`;
        icsAccessId = accessId;   // project-scope the UID so the reply we receive maps back to this event
      }
    } catch {}
    // Bump SEQUENCE on a reschedule/cancel so calendar apps treat it as an UPDATE to the same event
    // (same UID) rather than a duplicate.
    const ics = buildAppointmentIcs(event, { method, organizerEmail, attendees: recipients, sequence: (cancel || updated) ? 1 : 0, accessId: icsAccessId });
    // content_type carries the METHOD so Gmail/Apple render it as an accept/decline invite.
    const attachments = [{ filename: `invite.ics`, content: Buffer.from(ics, "utf8").toString("base64"), content_type: `text/calendar; method=${method}; charset=utf-8` }];
    const ctaUrl = projectLink(accessId);
    const custSubject = cancel ? `Appointment canceled — ${event.title || "IOT TECHS"}`
      : reminder ? `Reminder: your ${noun} is tomorrow`
      : updated ? `Updated: your ${noun} was rescheduled`
      : `Your ${noun} is scheduled`;
    const staffSubject = cancel ? `Assignment canceled — ${event.title || accessId}`
      : reminder ? `Tomorrow: you're on a ${noun} (${accessId})`
      : updated ? `Assignment rescheduled — ${noun} (${accessId})`
      : `You're assigned — ${noun} (${accessId})`;
    const heading = cancel ? "Your appointment was canceled" : reminder ? `Reminder — your ${noun} is tomorrow` : updated ? `Your ${noun} was rescheduled` : `Your ${noun} is scheduled`;
    const intro = cancel ? "This appointment has been canceled. We'll be in touch to reschedule."
      : reminder ? "A quick reminder about your upcoming appointment — see you then."
      : updated ? "The date or time of your appointment changed — here are the new details. Your calendar will update automatically from the attached invite."
      : "Here are the details below. A calendar invite is attached so you can add it in one tap.";
    const tech = p.tech || p.assigned_tech || "";
    const text = [heading, "", intro, "",
      event.title ? `What:  ${event.title}` : null,
      whenLine ? `When:  ${whenLine}` : null,
      event.location ? `Where: ${event.location}  (${mapsUrl(event.location)})` : null,
      event.notes ? `Notes: ${event.notes}` : null,
      ctaUrl ? `\nOpen project: ${ctaUrl}` : null,
    ].filter((s) => s != null).join("\n");
    // Persist the invited roster on the event so the project can show "who's going" (X of Y) and
    // flag who hasn't confirmed yet. Best-effort; never blocks the send.
    if (!cancel) {
      try {
        const { getToolData, saveToolData } = await import("./db.js");
        const raw = getToolData(accessId, "schedule")?.data;
        const d = raw ? JSON.parse(raw) : null;
        const ev = d && Array.isArray(d.events) ? d.events.find((e) => String(e.id) === String(event.id)) : null;
        if (ev) {
          ev.invited = recipients.map((r) => ({ email: r.email, name: r.name || "", role: r.role || "" }));
          saveToolData(accessId, "schedule", JSON.stringify(d), "appt-invite");
        }
      } catch {}
    }
    const custName = p.contact_name || p.customer || "";
    let sent = 0, i = 0;
    for (const r of recipients) {
      if (i++ > 0) await new Promise((res) => setTimeout(res, 600));  // stay under Resend's ~2/sec rate limit so no recipient gets dropped
      const isStaff = r.role && r.role !== "customer";
      // Each recipient gets THEIR OWN confirm/reschedule token, so their Confirm records THEIR status.
      let changeUrl = "";
      try { if (!cancel && event.id != null && appUrl()) changeUrl = `${appUrl()}/appt/${await makeApptToken(accessId, event.id, r)}`; } catch {}
      const html = renderAppointmentEmail({ verb, event, noun, projectNo: accessId, tech, ctaUrl, changeUrl, internal: isStaff, customerName: custName });
      const res = await sendEmail({ to: r.email, subject: isStaff ? staffSubject : custSubject, html, text, attachments });
      if (res?.ok || res?.skipped) sent++;
    }
    return { ok: true, sent, recipients: recipients.length };
  } catch (e) {
    console.error(`[email:appointment] ${e?.message || e}`);
    return { ok: false, error: "exception" };
  }
}
