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
  const has = (k) => !!(secretValue(k) || "").trim();
  return Response.json({
    ok: true,
    configured: squareConfigured(),   // SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID both present
    env: squareEnv(),                 // "production" | "sandbox"
    webhook: has("SQUARE_WEBHOOK_SIGNATURE_KEY"),
    // Temporary diagnostic — BOOLEANS/COUNTS ONLY, never a secret value. Tells apart "SQUARE_* not saved /
    // misnamed" from "this process reads a different/empty vault DB": if other known keys read present but
    // the SQUARE_* ones don't, the DB is right and it's a save/naming issue.
    diag: {
      sqToken: has("SQUARE_ACCESS_TOKEN"),
      sqLocation: has("SQUARE_LOCATION_ID"),
      sqEnv: has("SQUARE_ENV"),
      otherVaultKeys: ["RESEND_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_ADDRESS_KEY"].filter(has).length,
    },
  });
}
