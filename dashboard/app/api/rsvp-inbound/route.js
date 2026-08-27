import { verifyRsvpToken } from "../../../lib/auth";
import { getJobByAccessId, getToolData, saveToolData, logProjectEvent, notifyRoles, secretValue } from "../../../lib/db";

// Inbound calendar-RSVP webhook. When an invitee clicks Yes / No / Maybe in Gmail or Apple Mail,
// their calendar mails an iMIP REPLY (METHOD:REPLY, one ATTENDEE line with PARTSTAT) to the
// plus-tagged ORGANIZER address we set on the invite (rsvp+<token>@<RSVP_INBOUND_DOMAIN>). Resend
// Inbound delivers that email here as a webhook. We decode the token → the event, read the PARTSTAT,
// and record it into the same ev.confirmations map the roster + header chip already read.
//
// Setup (owner, one-time): verify a subdomain in Resend, point its MX at Resend Inbound, set the
// webhook to POST here, then store RSVP_INBOUND_DOMAIN (e.g. reply.iot-techs.com) and
// RSVP_INBOUND_SECRET (the webhook signing secret, whsec_…) in the API-Key Vault. Until then the
// outgoing invites keep the plain organizer and this route simply never fires.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fold-unfold RFC5545 continued lines (CRLF + space/tab), then normalize newlines.
function unfoldIcs(s) { return String(s || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").replace(/\r\n/g, "\n"); }

// Deep-scan an arbitrary JSON payload for the first string value matching a test — lets us tolerate
// whatever envelope shape the provider uses (to/from/attachments/raw all vary).
function deepFind(obj, test, depth = 0) {
  if (obj == null || depth > 6) return null;
  if (typeof obj === "string") return test(obj) ? obj : null;
  if (Array.isArray(obj)) { for (const v of obj) { const r = deepFind(v, test, depth + 1); if (r) return r; } return null; }
  if (typeof obj === "object") { for (const k of Object.keys(obj)) { const r = deepFind(obj[k], test, depth + 1); if (r) return r; } return null; }
  return null;
}
// Collect ALL matching strings (used to scan every recipient/attachment for the calendar body).
function deepCollect(obj, test, out = [], depth = 0) {
  if (obj == null || depth > 6) return out;
  if (typeof obj === "string") { if (test(obj)) out.push(obj); return out; }
  if (Array.isArray(obj)) { for (const v of obj) deepCollect(v, test, out, depth + 1); return out; }
  if (typeof obj === "object") { for (const k of Object.keys(obj)) deepCollect(obj[k], test, out, depth + 1); return out; }
  return out;
}

// A base64 blob (attachment content) that decodes to a VCALENDAR → return the decoded text.
function decodeCalendarBlobs(payload) {
  const blobs = deepCollect(payload, (s) => /^[A-Za-z0-9+/=\r\n]+$/.test(s) && s.length > 40 && s.length < 200000);
  for (const b of blobs) {
    try { const txt = Buffer.from(b.replace(/\s+/g, ""), "base64").toString("utf8"); if (/BEGIN:VCALENDAR/i.test(txt)) return txt; } catch {}
  }
  return null;
}

// Verify a Svix-style signature (Resend webhooks). Secret is "whsec_<base64>"; signature header holds
// space-separated "v1,<base64sig>" entries over `${id}.${timestamp}.${rawBody}`.
async function svixOk(headers, rawBody, secret) {
  try {
    const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sigHeader = headers.get("svix-signature");
    if (!id || !ts || !sigHeader) return false;
    const keyB64 = secret.replace(/^whsec_/, "");
    const keyBytes = Uint8Array.from(Buffer.from(keyB64, "base64"));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
    const expected = Buffer.from(new Uint8Array(mac)).toString("base64");
    return sigHeader.split(" ").some((p) => p.split(",")[1] === expected);
  } catch { return false; }
}

const PARTSTAT_STATUS = { ACCEPTED: "going", DECLINED: "declined", TENTATIVE: "tentative" };

export async function POST(request) {
  const raw = await request.text();

  // Auth: prefer the signed webhook; if no secret is configured yet, the signed rsvp token in the
  // recipient address (below) is the gate — that token is never public, only in invites we send.
  const secret = (() => { try { return secretValue("RSVP_INBOUND_SECRET"); } catch { return ""; } })();
  if (secret && !(await svixOk(request.headers, raw, secret))) {
    return Response.json({ ok: false, error: "bad-signature" }, { status: 401 });
  }

  let payload; try { payload = JSON.parse(raw); } catch { return Response.json({ ok: false, error: "bad-json" }, { status: 400 }); }

  // 1) Which event? Decode the rsvp+<token> we addressed the ORGANIZER to (primary), else fall back
  //    to the project-scoped UID echoed in the reply body.
  const ics = unfoldIcs(decodeCalendarBlobs(payload) || deepFind(payload, (s) => /BEGIN:VCALENDAR/i.test(s)) || "");
  const toStr = deepFind(payload, (s) => /rsvp\+[A-Za-z0-9._-]+@/i.test(s)) || "";
  const tokenM = toStr.match(/rsvp\+([A-Za-z0-9._-]+)@/i);
  let target = tokenM ? await verifyRsvpToken(tokenM[1]) : null;
  if (!target) {
    const uidM = ics.match(/UID:([^\n]+)/i);
    const uid = uidM ? uidM[1].trim() : "";
    const m = uid.match(/^(.*?)-(.*)@iottechs$/i);
    if (m) target = { accessId: m[1], eventId: m[2] };
  }
  if (!target) return Response.json({ ok: false, error: "no-event" }, { status: 200 });

  // 2) Only iMIP REPLYs carry an RSVP; ignore anything else the mailbox receives.
  if (!/METHOD:REPLY/i.test(ics)) return Response.json({ ok: false, error: "not-a-reply" }, { status: 200 });

  // 3) Who + what did they choose? One ATTENDEE line in a REPLY.
  const attM = ics.match(/ATTENDEE[^:\n]*:mailto:([^\n]+)/i);
  // The REPLY always carries one ATTENDEE mailto; fall back to the envelope From only if it doesn't.
  const fromRaw = typeof payload.from === "string" ? payload.from : (payload.from?.address || payload.from?.email || "");
  const fromEmail = (String(fromRaw).match(/[^<>\s]+@[^<>\s]+/) || [""])[0].toLowerCase();
  const email = attM ? attM[1].trim().toLowerCase() : fromEmail;
  const partM = ics.match(/PARTSTAT=([A-Z-]+)/i);
  const status = PARTSTAT_STATUS[(partM ? partM[1] : "").toUpperCase()];
  if (!email || !status) return Response.json({ ok: false, error: "unparsable-reply" }, { status: 200 });
  const cnM = ics.match(/ATTENDEE[^:\n]*CN=([^;:\n]+)/i);
  const cn = cnM ? cnM[1].replace(/\\,/g, ",").trim() : "";

  // 4) Record it on the event, keyed by email — same shape /appt confirm writes, plus status + via.
  const p = getJobByAccessId(target.accessId);
  if (!p) return Response.json({ ok: false, error: "no-project" }, { status: 200 });
  let changed = false, who = cn || email, role = "";
  try {
    const d0 = getToolData(target.accessId, "schedule")?.data;
    const d = d0 ? JSON.parse(d0) : null;
    const ev = d && Array.isArray(d.events) ? d.events.find((e) => String(e.id) === String(target.eventId)) : null;
    if (ev) {
      const invited = Array.isArray(ev.invited) ? ev.invited : [];
      const match = invited.find((r) => String(r.email || "").toLowerCase() === email);
      if (match) { who = match.name || who; role = match.role || ""; }
      ev.confirmations = ev.confirmations && typeof ev.confirmations === "object" ? ev.confirmations : {};
      const prev = ev.confirmations[email];
      if (!prev || prev.status !== status || prev.via !== "calendar") {
        ev.confirmations[email] = { name: who, role, at: new Date().toISOString().slice(0, 19).replace("T", " "), status, via: "calendar" };
        if (status === "going" && role === "customer" && !ev.confirmed_at) ev.confirmed_at = ev.confirmations[email].at;
        saveToolData(target.accessId, "schedule", JSON.stringify(d), "rsvp-inbound");
        changed = true;
      }
    }
  } catch {}

  // 5) Mirror the in-app confirm side-effects: Job Log + office notification (no ticket, per decision).
  if (changed) {
    const roleTag = role && role !== "customer" ? ` (${role})` : "";
    const verbWord = status === "going" ? "accepted" : status === "declined" ? "declined" : "tentatively accepted";
    try { logProjectEvent(target.accessId, { kind: status === "declined" ? "request" : "approve", label: `${who}${roleTag} ${verbWord} their appointment (via calendar)`.slice(0, 300), actor: who }); } catch {}
    try { notifyRoles(["admin", "manager"], { type: "appt-rsvp", title: `Appointment ${verbWord}`, body: `${who}${roleTag} (${target.accessId}) ${verbWord} via their calendar.`, link: `/project/${target.accessId}` }); } catch {}
  }
  return Response.json({ ok: true, recorded: changed, status });
}
