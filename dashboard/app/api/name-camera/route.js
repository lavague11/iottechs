import { secretValue } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// Names a security camera from its installation photo (what the camera sees) via Claude vision.
// Staff-only; the Anthropic key stays server-side (vault → env, same as the ID Scanner proxy).
// The client posts one camera's photo as base64 + light survey context; we return a short label
// like "Front Yard" / "Driveway" that the survey then saves onto the device (→ flows to the proposal).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Keep the model on-task: a short, installer-style location label and nothing else.
function buildPrompt({ floor, existing }) {
  const avoid = Array.isArray(existing) && existing.length
    ? ` Other cameras on this job are already named: ${existing.slice(0, 20).join(", ")}. If this camera covers a different spot, give it a distinct name; only reuse a name if it truly shares the same view.`
    : "";
  const where = floor ? ` It is on "${floor}".` : "";
  return `This photo shows what a security camera sees from where it is installed.${where} Give it a short location label an installer would use — 1 to 3 words, Title Case — describing the area it covers. Examples: Front Yard, Backyard, Driveway, Garage, Front Door, Back Door, Side Entrance, Front Porch, Parking Lot, Loading Dock, Hallway, Living Room, Kitchen, Warehouse, Side Yard.${avoid} Reply with ONLY the label — no quotes, punctuation, or explanation.`;
}

// Trim the model's reply to a clean 1–3 word label.
function cleanName(raw) {
  let s = String(raw || "").trim().replace(/^["'`]+|["'`.]+$/g, "").trim();
  s = s.split(/\r?\n/)[0].trim();                 // first line only
  s = s.replace(/[^\p{L}\p{N}&'/ -]/gu, "").trim(); // strip stray punctuation
  const words = s.split(/\s+/).filter(Boolean).slice(0, 4);
  s = words.join(" ");
  return s.slice(0, 40);
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager", "sales", "tech"].includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set — add it in Development ▸ API Keys." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const imageBase64 = String(body?.imageBase64 || "");
  const mediaType = MEDIA_TYPES.has(body?.mediaType) ? body.mediaType : "image/jpeg";
  if (!imageBase64 || imageBase64.length < 100) return Response.json({ error: "no-image" }, { status: 400 });
  if (imageBase64.length > 8_000_000) return Response.json({ error: "image-too-large" }, { status: 413 }); // ~6MB decoded

  const prompt = buildPrompt({ floor: body?.context?.floor, existing: body?.context?.existing });

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 24,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    console.error("name-camera upstream failed", e);
    return Response.json({ error: "Namer unavailable — try again." }, { status: 504 });
  }

  if (!upstream.ok) {
    const t = await upstream.text().catch(() => "");
    console.error("name-camera anthropic error", upstream.status, t.slice(0, 300));
    return Response.json({ error: "Namer error — try again." }, { status: 502 });
  }
  const data = await upstream.json().catch(() => null);
  const raw = data?.content?.find?.((b) => b.type === "text")?.text || "";
  const name = cleanName(raw);
  if (!name) return Response.json({ error: "no-name" }, { status: 422 });
  return Response.json({ ok: true, name });
}
