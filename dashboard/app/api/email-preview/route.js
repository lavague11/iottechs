import { renderAppointmentEmail } from "../../../lib/email";
import { getSessionUser } from "../../../lib/session";

// Renders a sample appointment email so staff can preview the design. Open in dev; admin-only in prod.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (process.env.NODE_ENV === "production") {
    const user = await getSessionUser().catch(() => null);
    if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });
  }
  const verb = new URL(request.url).searchParams.get("verb") || "scheduled"; // scheduled|updated|reminder|canceled
  const event = { id: 1, kind: "install", title: "10317 Longmeadow Ave — Installation", date: "2026-08-31", time: "12:00", duration: "60", location: "10317 Longmeadow Ave, Parrish, FL 34219, USA", notes: "Gate code 4821 — please park in the driveway." };
  const html = renderAppointmentEmail({ verb, event, noun: "installation", projectNo: "ASC0036", tech: "", ctaUrl: "https://iot-techs.com/project/ASC0036", changeUrl: "https://iot-techs.com/appt/sample.token" });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
