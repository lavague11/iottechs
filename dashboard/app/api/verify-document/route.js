import { secretValue } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// Document verification — reads the FRONT of a driver's licence / state ID with
// Claude vision and returns the printed text plus image-quality flags. Our code
// then does the deterministic work: expiry math and (optionally) cross-checking
// the printed text against PDF417 barcode fields the caller decoded.
//
// It does NOT do face matching — that's biometric identification and stays
// client-side in the Face Verify tool. Staff-only; the key is read from the
// vault (Development ▸ API Keys) and never reaches the browser. Nothing here is
// stored: the caller keeps the verdict, not the image.
//
// Adapted from the owner's verify-document-route.ts to this project's stack
// (raw fetch + vault key, mirroring /api/read-licence — no SDK, no TS).

export const runtime = "nodejs";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6"; // the project's validated ID-read model

const SYSTEM = `You read US driver's licenses and state ID cards and return their printed text as JSON.

Return ONLY a JSON object. No preamble, no markdown fences, no commentary.

Schema — use null for any field you cannot read with confidence. Never guess:
{
  "document_type": "driver_license" | "state_id" | "not_an_id" | null,
  "issuing_state": "two-letter code or null",
  "first_name": null, "middle_name": null, "last_name": null,
  "date_of_birth": "YYYY-MM-DD or null",
  "license_number": null,
  "address_line": null, "city": null, "state": null, "zip": null,
  "issue_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "license_class": null, "restrictions": null, "endorsements": null,
  "quality_flags": [],
  "legible": true,
  "notes": "one short line, or null"
}

quality_flags — include any that apply, from this list only:
  "glare"              reflection obscures part of the card
  "blur"               out of focus
  "cropped"            an edge or corner is cut off
  "low_resolution"     too few pixels to read reliably
  "screen_capture"     this is a photo of a screen or a screenshot, not the physical card
  "photocopy"          this is a scan or photocopy, not the physical card
  "portrait_obscured"  the face portrait is covered, missing, or unreadable
  "damaged"            the card is physically damaged
  "layout_irregular"   the layout or fonts do not match a standard license for this state

Do not assess whether the person is who they say they are. Do not describe,
compare, or identify the face in the portrait. Read printed text only.`;

/* ---------- deterministic helpers (logic stays out of the model) ---------- */

const norm = (s) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function compare(label, front, back) {
  if (!front || !back) return null;
  const a = norm(front), b = norm(back);
  if (!a || !b) return null;
  return { field: label, front, barcode: back, match: a === b };
}

function daysUntil(iso) {
  if (!iso) return null;
  const t = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

function parseJson(raw) {
  const clean = String(raw).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(clean.slice(start, end + 1));
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set — add it in Development ▸ API Keys." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const image = body?.frontImageBase64;
  const mediaType = body?.mediaType || "image/jpeg";
  const barcode = body?.barcodeFields || {};

  if (!image) return Response.json({ error: "frontImageBase64 is required" }, { status: 400 });
  // ~7MB base64 ceiling; resize client-side before sending.
  if (image.length > 7_000_000) return Response.json({ error: "Image too large — resize to 1600px on the long edge" }, { status: 413 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) {
    return Response.json({ error: "mediaType must be jpeg, png, or webp" }, { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "Read this ID and return the JSON object." },
          ],
        }],
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    console.error("verify-document upstream failed", e);
    return Response.json({ error: "Reader unavailable — try again." }, { status: 504 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("verify-document upstream status", upstream.status, detail.slice(0, 200));
    return Response.json({ error: "Document read failed upstream." }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

  let front;
  try { front = parseJson(text); } catch { return Response.json({ error: "Could not parse document read", raw: text }, { status: 502 }); }

  /* --- deterministic checks --- */
  const qf = Array.isArray(front.quality_flags) ? front.quality_flags : [];
  const expiryDays = daysUntil(front.expiry_date ?? barcode.expiry);
  const crossChecks = [
    compare("last_name", front.last_name, barcode.lastName),
    compare("first_name", front.first_name, barcode.firstName),
    compare("date_of_birth", front.date_of_birth, barcode.dob),
    compare("license_number", front.license_number, barcode.licenseNumber),
    compare("expiry_date", front.expiry_date, barcode.expiry),
    compare("zip", front.zip, barcode.zip),
  ].filter(Boolean);

  const mismatches = crossChecks.filter((c) => !c.match).map((c) => c.field);
  const checked = crossChecks.length;

  const blockers = [];
  if (front.document_type === "not_an_id") blockers.push("not_a_valid_id");
  if (qf.includes("screen_capture")) blockers.push("photo_of_a_screen");
  if (qf.includes("photocopy")) blockers.push("photocopy_not_original");
  if (expiryDays !== null && expiryDays < 0) blockers.push("expired");
  if (mismatches.length) blockers.push("front_barcode_mismatch");

  const warnings = [];
  if (front.legible === false) warnings.push("poor_legibility");
  if (expiryDays !== null && expiryDays >= 0 && expiryDays < 30) warnings.push("expires_within_30_days");
  if (checked === 0) warnings.push("no_barcode_data_to_cross_check");
  if (qf.includes("layout_irregular")) warnings.push("layout_irregular");
  if (qf.includes("portrait_obscured")) warnings.push("portrait_unusable_for_face_match");

  return Response.json({
    status: blockers.length ? "fail" : warnings.length ? "review" : "pass",
    blockers,
    warnings,
    expiry: { date: front.expiry_date ?? barcode.expiry ?? null, days_remaining: expiryDays },
    cross_check: { fields_checked: checked, mismatches, detail: crossChecks },
    quality_flags: qf,
    fields: front,
    checked_at: new Date().toISOString(),
  });
}
