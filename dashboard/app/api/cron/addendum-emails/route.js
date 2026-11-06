import { getSessionUser } from "../../../../lib/session";
import { secretValue } from "../../../../lib/db";
import { sendDueAddendumEmails } from "../../../../lib/addendum-emails";

// Manual / external trigger for the scheduled add-on approval-email sweep (the boot scheduler also runs it).
// Admin session, or a request carrying the matching CRON_KEY. Safe to hit repeatedly — sends are one-shot.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser().catch(() => null);
  const key = secretValue("CRON_KEY");
  const provided = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key") || "";
  const ok = user?.role === "admin" || (key && provided && provided === key);
  if (!ok) return new Response("Forbidden", { status: 403 });
  const r = await sendDueAddendumEmails();
  return Response.json(r);
}
