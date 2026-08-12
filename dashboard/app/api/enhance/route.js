import { createHash } from "crypto";
import { secretValue } from "../../../lib/db";
import { DEFAULT_AERIAL, DEFAULT_FLOORPLAN, PROMPT_KEYS } from "../../../lib/survey-prompts";

// Server-side proxy for the satellite "Enhance" pass. The browser sends a padded
// SQUARE PNG of the crop; we call OpenAI images/edits with the vault key (never the
// client's) and return the generated image as base64. The client crops the square
// result back to the original proportions. Key handling stays entirely server-side.
export const runtime = "nodejs";

// Cost guard: identical (mode,labels,image) requests — a Redo, or the same crop sent
// twice — return the stored result instead of re-billing OpenAI. Small LRU, in-memory.
const CACHE = new Map();
const CACHE_MAX = 24;
function cacheGet(h) { const v = CACHE.get(h); if (v) { CACHE.delete(h); CACHE.set(h, v); } return v; }
function cacheSet(h, v) { CACHE.set(h, v); if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value); }

// Prompts live in lib/survey-prompts.js (shared with the editor). An admin can override
// either from the survey tool; the override is stored in the vault and wins over the default.
function promptFor(mode) {
  return secretValue(PROMPT_KEYS[mode]) || (mode === "floorplan" ? DEFAULT_FLOORPLAN : DEFAULT_AERIAL);
}

export async function POST(req) {
  const key = secretValue("OPENAI_API_KEY");
  if (!key) return Response.json({ error: "OpenAI Enhance isn't configured — add OPENAI_API_KEY in Development ▸ API Keys." }, { status: 503 });

  let inForm;
  try { inForm = await req.formData(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  const image = inForm.get("image");
  if (!image || typeof image === "string") return Response.json({ error: "No image" }, { status: 400 });

  // Pick the prompt server-side by mode (never trust a client-supplied prompt); the
  // floor-plan mode may append a short, sanitized label list to name each space.
  const mode = inForm.get("mode") === "floorplan" ? "floorplan" : "aerial";
  let prompt = promptFor(mode), labels = "";
  if (mode === "floorplan") {
    labels = String(inForm.get("labels") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 400);
    if (labels) prompt += ` The labels are: ${labels}.`;
  }
  // Per-render revision: a one-off operator nudge for THIS image, appended to the base
  // prompt (not saved). Sanitized + capped; folded into the cache key so it's distinct.
  const revision = String(inForm.get("revision") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  if (revision) prompt += ` Apply this specific revision to this image, without otherwise changing the framing or inventing structures: ${revision}.`;

  // Cost controls: MEDIUM quality is ≈4× cheaper than high and plenty for a cleanup pass
  // and a sketch→plan. Aerial keeps input_fidelity HIGH so the model preserves the exact
  // framing (this is the over-crop fix); floor-plan uses low since it deliberately redraws.
  const quality = "medium";
  const inputFidelity = mode === "aerial" ? "high" : "low";

  const buf = Buffer.from(await image.arrayBuffer());
  const hash = createHash("sha256").update(mode).update("|").update(labels).update("|").update(revision).update("|").update(buf).digest("hex");
  const hit = cacheGet(hash);
  if (hit) return Response.json({ b64: hit, cached: true });

  async function call(model) {
    const fd = new FormData();
    fd.append("model", model);
    fd.append("image", new Blob([buf], { type: "image/png" }), "crop.png");
    fd.append("prompt", prompt);
    fd.append("size", "1024x1024");
    fd.append("quality", quality);
    fd.append("input_fidelity", inputFidelity);
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
    let d = await call("gpt-image-1.5");   // cheaper + preserves input framing better than gpt-image-2
    // model-name drift / unavailable → fall back a generation
    if (d?.error && /model/i.test(d.error.message || "")) d = await call("gpt-image-2");
    if (d?.error) return Response.json({ error: d.error.message || "Enhance failed" }, { status: 502 });
    const b64 = d?.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: "No image returned" }, { status: 502 });
    cacheSet(hash, b64);
    return Response.json({ b64 });
  } catch (e) {
    return Response.json({ error: e?.name === "AbortError" ? "Enhance timed out" : "Enhance failed" }, { status: 502 });
  }
}
