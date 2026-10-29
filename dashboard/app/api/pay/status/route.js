import { squareConfigured, squareEnv } from "../../../../lib/square";
import { secretValue } from "../../../../lib/db";

// Public, no-secret status probe for the Square integration, so staff (and this tooling) can confirm at a
// glance that online payments are switched on and in which mode — without logging in and without exposing
// anything sensitive. It returns ONLY booleans + the env name; NEVER a key, token, location id, signing
// key or any secret value. Whether the keys are actually VALID against Square's API is proven by generating
// a real checkout link in the staff UI (/pay-link or Record Payment → "Pay with Square"); this endpoint
// only reports whether the vault is populated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    configured: squareConfigured(),   // SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID both present
    env: squareEnv(),                 // "production" | "sandbox"
    webhook: !!(secretValue("SQUARE_WEBHOOK_SIGNATURE_KEY") || "").trim(),
  });
}
