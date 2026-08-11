import { secretValue } from "../../../lib/db";

// Server-side proxy for the satellite "Enhance" pass. The browser sends a padded
// SQUARE PNG of the crop; we call OpenAI images/edits with the vault key (never the
// client's) and return the generated image as base64. The client crops the square
// result back to the original proportions. Key handling stays entirely server-side.
export const runtime = "nodejs";

// Verbatim from the handoff (§5) — polish an already-leveled aerial, don't restyle.
const PROMPT = "This is a real aerial photograph taken straight down over a residential property. Return a photorealistic aerial photograph, not an illustration, render, painting, 3D render, game asset, map graphic or cartoon. Keep it looking like genuine satellite imagery with natural daylight, real photographic grain, soft realistic shadows in the same direction as the original, and muted true-to-life colour. Do not stylise, saturate, cel-shade, outline or flatten anything. Clean up capture artefacts and tidy the grounds so the property looks well kept: reduce noise and compression blocking, repair seams and blurred patches, render lawn and yard as healthy even green grass (remove brown or bare spots, dirt, debris), make patios, pavers, driveways and pool decking read as clean evenly-coloured surfaces with crisp joints, and give garden beds, shrubs and tree canopy crisp natural detail. Present the property perfectly level and square to the frame: roof ridges, walls, driveways, fences, property lines and the street should read as straight horizontal or vertical lines, with no tilt, skew, rotation or keystone. If anything sits slightly crooked, straighten it so the whole image looks squared-up and level, but keep every structure in the same place at the same size and shape. Keep the framing and every edge exactly as given. Do not add, remove, move, crop, zoom or invent anything.";

export async function POST(req) {
  const key = secretValue("OPENAI_API_KEY");
  if (!key) return Response.json({ error: "OpenAI Enhance isn't configured — add OPENAI_API_KEY in Development ▸ API Keys." }, { status: 503 });

  let inForm;
  try { inForm = await req.formData(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  const image = inForm.get("image");
  if (!image || typeof image === "string") return Response.json({ error: "No image" }, { status: 400 });

  async function call(model) {
    const fd = new FormData();
    fd.append("model", model);
    fd.append("image", image, "crop.png");
    fd.append("prompt", PROMPT);
    fd.append("size", "1024x1024");
    fd.append("quality", "high");
    fd.append("input_fidelity", "high");
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: ctrl.signal,
      });
      return await r.json();
    } finally { clearTimeout(killer); }
  }

  try {
    let d = await call("gpt-image-2");
    // model-name drift → fall back one generation
    if (d?.error && /model/i.test(d.error.message || "")) d = await call("gpt-image-1.5");
    if (d?.error) return Response.json({ error: d.error.message || "Enhance failed" }, { status: 502 });
    const b64 = d?.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: "No image returned" }, { status: 502 });
    return Response.json({ b64 });
  } catch (e) {
    return Response.json({ error: e?.name === "AbortError" ? "Enhance timed out" : "Enhance failed" }, { status: 502 });
  }
}
