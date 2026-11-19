import { getSessionUser } from "../../../../lib/session";
import { secretValue } from "../../../../lib/db";
import { sweepEndOfDayReminders, sweepSignoffReminders } from "../../../../lib/wo-notify";

// Manual / external trigger for the work order sweeps (the boot scheduler in instrumentation.js runs
// them hourly on its own). Two of them:
//   • end of day — a technician 12 hours past their check-in who hasn't closed the day
//   • sign-off   — a customer asked to sign the finished work off a day ago who hasn't
// Allowed for an admin session, or a request carrying the matching CRON_KEY, exactly like the
// appointment-reminder route beside it. Safe to hit repeatedly: each reminder is claimed once in the
// DB, so a second call sends nothing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser().catch(() => null);
  const key = secretValue("CRON_KEY");
  const provided = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key") || "";
  const ok = user?.role === "admin" || (key && provided && provided === key);
  if (!ok) return new Response("Forbidden", { status: 403 });

  const endOfDay = await sweepEndOfDayReminders();
  const signoff = await sweepSignoffReminders();
  return Response.json({ endOfDay, signoff });
}
