import { secretValue } from "../../../../lib/db";
import { getSessionUser } from "../../../../lib/session";
import { enhancePrompt, canEditSop, SOP_IMAGE_MODEL_DEFAULT, SOP_IMAGE_MODEL_FALLBACK } from "../../../../lib/sop-model";

// SOP Builder — "Enhance photo". Server-side proxy for the OpenAI image edit (vault key, never the
// browser's). Takes one step's ORIGINAL photo (data URL) + its title/instruction/target/where, asks OpenAI
// to clean the photo and draw a yellow circle/arrow on the thing the step is about, and returns the new
// image as base64. The original is always kept client-side; this only produces the "enhanced" version.
// Staff only. Mirrors /api/enhance (same model-drift + billing handling).
export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/images/edits";
const MAX_DATAURL = 12 * 1024 * 1024;

export async function POST(req) {
  const user = await getSessionUser();
  if (!user?.id || !canEditSop(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const key = secretValue("OPENAI_API_KEY");
  if (!key) return Response.json({ error: "Enhance isn’t configured — add OPENAI_API_KEY in Development ▸ API Keys." }, { status: 503 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const image = String(body?.image || "");
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return Response.json({ error: "No image" }, { status: 400 });
  if (m[2].length > MAX_DATAURL) return Response.json({ error: "Photo is too large to enhance." }, { status: 413 });

  const prompt = enhancePrompt({ title: body?.title, instruction: body?.instruction, target: body?.target, where: body?.where });
  const buf = Buffer.from(m[2], "base64");
  const model = secretValue("SOP_IMAGE_MODEL") || SOP_IMAGE_MODEL_DEFAULT;

  async function call(mdl) {
    const fd = new FormData();
    fd.append("model", mdl);
    fd.append("image[]", new Blob([buf], { type: m[1] }), "photo.jpg");
    fd.append("prompt", prompt);
    fd.append("size", "auto");
    fd.append("quality", "medium");
    fd.append("output_format", "jpeg");
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const r = await fetch(OPENAI_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: ctrl.signal });
      return await r.json();
    } finally { clearTimeout(killer); }
  }

  try {
    let d = await call(model);
    if (d?.error && /model/i.test(d.error.message || "")) d = await call(SOP_IMAGE_MODEL_FALLBACK);  // model-name drift → fall back
    if (d?.error) {
      const msg = d.error.message || "Enhance failed";
      if (/credit|quota|billing|insufficient|exceeded your current quota/i.test(msg)) {
        return Response.json({ error: "Enhance is paused — the OpenAI account is out of credits. Add credits at platform.openai.com (Settings ▸ Billing)." }, { status: 402 });
      }
      return Response.json({ error: /api key|invalid/i.test(msg) ? "The OpenAI key is invalid." : msg }, { status: 502 });
    }
    const b64 = d?.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: "OpenAI returned no image." }, { status: 502 });
    return Response.json({ ok: true, b64: `data:image/jpeg;base64,${b64}` });
  } catch (e) {
    return Response.json({ error: e?.name === "AbortError" ? "Enhance timed out — try again." : "Enhance failed." }, { status: 502 });
  }
}
