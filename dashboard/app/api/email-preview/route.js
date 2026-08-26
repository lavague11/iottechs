import { renderAppointmentEmail, sendEmail, buildAppointmentIcs } from "../../../lib/email";
import { getSessionUser } from "../../../lib/session";

// Preview / self-test the appointment email design.
//   GET /api/email-preview            → renders the sample email (open in dev; admin-only in prod)
//   GET /api/email-preview?send=1     → emails the sample to the signed-in admin's own address
//   GET /api/email-preview?send=<addr>&key=<CRON_KEY> → sends to an address (for headless testing)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const verb = searchParams.get("verb") || "scheduled"; // scheduled|updated|reminder|canceled
  const send = searchParams.get("send");

  const user = await getSessionUser().catch(() => null);
  const isAdmin = user?.role === "admin";
  if (process.env.NODE_ENV === "production" && !isAdmin && !send) {
    return new Response("Forbidden", { status: 403 });
  }

  const { secretValue } = await import("../../../lib/db");
  const { makeApptToken } = await import("../../../lib/auth");
  const base = (secretValue("APP_URL") || "https://iot-techs.com").replace(/\/+$/, "");
  const event = { id: 1, kind: "install", title: "10317 Longmeadow Ave — Installation", date: "2026-08-31", time: "12:00", duration: "60", location: "10317 Longmeadow Ave, Parrish, FL 34219, USA", notes: "Gate code 4821 — please park in the driveway." };

  // Resolve the recipient FIRST so the confirm/reschedule link carries a REAL, per-recipient token
  // (so tapping Confirm in the test actually records that recipient's status).
  let to = "";
  if (send) {
    if (send === "1") { if (!isAdmin) return new Response("Forbidden", { status: 403 }); to = user.email; }
    else { const key = secretValue("CRON_KEY"); if (!key || searchParams.get("key") !== key) return new Response("Forbidden", { status: 403 }); to = send; }
    if (!to || !to.includes("@")) return Response.json({ ok: false, error: "no-recipient" }, { status: 400 });
  }
  const who = { email: to || "sample@iot-techs.com", name: to ? "You" : "Sample Recipient", role: "customer" };
  const changeUrl = `${base}/appt/${await makeApptToken("ASC0036", 1, who)}`;
  const html = renderAppointmentEmail({ verb, event, noun: "installation", projectNo: "ASC0036", tech: "", ctaUrl: `${base}/project/ASC0036`, changeUrl });

  if (send) {
    const ics = buildAppointmentIcs(event, { method: "REQUEST", attendees: [{ email: to }] });
    const attachments = [{ filename: "invite.ics", content: Buffer.from(ics, "utf8").toString("base64"), content_type: "text/calendar; method=REQUEST; charset=utf-8" }];
    const r = await sendEmail({ to, subject: "[Test] Your installation is scheduled", html, text: "Test appointment email.", attachments });
    return Response.json({ ok: !!r?.ok, sentTo: to, result: r });
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
