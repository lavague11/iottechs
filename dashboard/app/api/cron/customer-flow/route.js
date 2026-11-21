import { getSessionUser } from "../../../../lib/session";
import { secretValue } from "../../../../lib/db";
import { sweepCustomerFlowEmails } from "../../../../lib/customer-flow-sweep";

// Stage 5's time-based customer emails (docs/customer-flow-v2.md items 3, 4 and 9) — the quote-expiry
// pair, the 2-day post-signing payment reminder, and the plan's milestone-due notices. The boot
// scheduler also runs this; the route exists so an external cron can drive it, and so it can be
// triggered by hand while testing. Safe to hit repeatedly: every send is claimed in customer_email_log
// before it goes, so a second run sends nothing.
// Admin session, or a request carrying the matching CRON_KEY.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser().catch(() => null);
  const key = secretValue("CRON_KEY");
  const provided = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key") || "";
  const ok = user?.role === "admin" || (key && provided && provided === key);
  if (!ok) return new Response("Forbidden", { status: 403 });
  const r = await sweepCustomerFlowEmails();
  return Response.json(r);
}
