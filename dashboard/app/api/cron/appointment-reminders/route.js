import { getSessionUser } from "../../../../lib/session";
import { secretValue } from "../../../../lib/db";
import { sendDueAppointmentReminders } from "../../../../lib/appointment-reminders";

// Manual / external trigger for the 24h reminder sweep (the boot scheduler runs it automatically).
// Allowed for an admin session, or a request carrying the matching CRON_KEY (vault/env) — so an
// external scheduler can drive it if ever preferred. Safe to hit repeatedly; sends are deduped.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser().catch(() => null);
  const key = secretValue("CRON_KEY");
  const provided = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key") || "";
  const ok = user?.role === "admin" || (key && provided && provided === key);
  if (!ok) return new Response("Forbidden", { status: 403 });

  const r = await sendDueAppointmentReminders();
  return Response.json(r);
}
