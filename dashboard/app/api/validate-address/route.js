import { secretValue } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// Server-side proxy for the Google Address Validation API (used by the ID Scanner).
// The key NEVER reaches the browser — read from the vault (Development ▸ API Keys)
// or env (GOOGLE_ADDRESS_KEY). Restrict the key in Google Cloud Console to the
// Address Validation API, by IP (your server), not HTTP referrer. Staff-only.

const ENDPOINT = "https://addressvalidation.googleapis.com/v1:validateAddress";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Forbidden", { status: 403 });

  const key = secretValue("GOOGLE_ADDRESS_KEY");
  if (!key) return Response.json({ error: "GOOGLE_ADDRESS_KEY is not set — add it in Development ▸ API Keys." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { street = "", unit = "", city = "", state = "", zip = "" } = body || {};
  if (!street.trim() || !(zip.trim() || (city.trim() && state.trim()))) {
    return Response.json({ error: "Need a street plus a ZIP, or a city and state" }, { status: 400 });
  }

  const addressLines = [street.trim()];
  if (unit.trim()) addressLines.push(unit.trim());

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: {
          regionCode: "US",
          addressLines,
          locality: city.trim() || undefined,
          administrativeArea: state.trim() || undefined,
          postalCode: zip.trim() || undefined,
        },
        // USPS CASS gives DPV confirmation and the standardized address (US only).
        enableUspsCass: true,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Address Validation error", res.status, detail);
      return Response.json({ error: "Upstream rejected the request" }, { status: 502 });
    }

    const data = await res.json();
    // Pass through only what the widget uses.
    return Response.json(
      {
        result: {
          address: { formattedAddress: data?.result?.address?.formattedAddress ?? "" },
          verdict: data?.result?.verdict ?? {},
          uspsData: {
            standardizedAddress: data?.result?.uspsData?.standardizedAddress ?? {},
            dpvConfirmation: data?.result?.uspsData?.dpvConfirmation ?? "",
          },
        },
      },
      { headers: { "Cache-Control": "private, max-age=86400" } }
    );
  } catch (err) {
    console.error("Address Validation call failed", err);
    return Response.json({ error: "Address check unavailable" }, { status: 504 });
  }
}
