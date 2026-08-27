import { getSessionUser } from "../../lib/session";

// Smart brand-logo destination. Every IOT TECHS logo across the app links here; this decides where
// "home" is for the visitor: a logged-in staff member lands on the dashboard, everyone else on the
// public home page. One place owns the rule, so every logo behaves identically.
//
// getSessionUser() returns a placeholder object even when logged OUT (id:null), so a real session is
// detected by user?.id — not mere truthiness. Location is RELATIVE so the redirect resolves against
// the public origin (an absolute URL built from request.url would leak the internal socket host).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let dest = "/";
  try {
    const user = await getSessionUser();
    if (user?.id) dest = "/dashboard";
  } catch { /* not logged in → home */ }
  return new Response(null, { status: 307, headers: { Location: dest, "Cache-Control": "no-store" } });
}
