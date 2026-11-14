import { secretValue } from "../../../../lib/db";
import { getSessionUser } from "../../../../lib/session";
import { SOP_SYSTEM, sopUserInstruction, parseSopJson, normalizeSopResult, canEditSop, SOP_CLAUDE_MODEL_DEFAULT } from "../../../../lib/sop-model";

// SOP Builder — "Build SOP". Server-side proxy for the Claude call (the vault key NEVER reaches the
// browser, unlike the phone prototype). The browser sends the already-resized photos (data URLs, ~1100px
// per the handoff) + the spoken transcript; we call the Anthropic Messages API with the EXACT prompts from
// lib/sop-model.js and return the cleaned, ordered steps. Staff only. Model is vault-overridable.
export const runtime = "nodejs";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_PHOTOS = 20;                 // generous cap; the UI keeps 3–15 steps
const MAX_DATAURL = 8 * 1024 * 1024;   // per-photo guard (~8MB data URL)

// Pull the base64 + media type out of a data URL; returns null for anything else (we only accept the
// browser's own resized JPEGs/PNGs here — not arbitrary remote URLs).
function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  if (m[2].length > MAX_DATAURL) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

export async function POST(req) {
  const user = await getSessionUser();
  if (!user?.id || !canEditSop(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "AI isn’t configured — add ANTHROPIC_API_KEY in Development ▸ API Keys." }, { status: 503 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const photos = Array.isArray(body?.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
  const transcript = String(body?.transcript || "").trim();
  if (!photos.length) return Response.json({ error: "Add your photos first." }, { status: 400 });
  if (!transcript) return Response.json({ error: "Talk through the steps first." }, { status: 400 });

  // Build the user message: each photo as `Photo N:` + its image, then the JSON instruction.
  const content = [];
  for (let i = 0; i < photos.length; i++) {
    const blk = imageBlock(photos[i]);
    if (!blk) continue;
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push(blk);
  }
  const sentPhotoCount = content.filter((c) => c.type === "image").length;
  if (!sentPhotoCount) return Response.json({ error: "Couldn’t read the photos — try re-adding them." }, { status: 400 });
  content.push({ type: "text", text: sopUserInstruction(transcript) });

  const model = secretValue("SOP_CLAUDE_MODEL") || SOP_CLAUDE_MODEL_DEFAULT;

  // Retry on 429/500/529 up to 3× (handoff §5).
  let lastErr = "AI error";
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try {
      r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 6000, system: SOP_SYSTEM, messages: [{ role: "user", content }] }),
      });
    } catch {
      if (attempt < 2) { await new Promise((s) => setTimeout(s, 1500)); continue; }
      return Response.json({ error: "Couldn’t reach the AI — check the connection and try again." }, { status: 502 });
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      try {
        const text = (j.content || []).map((c) => c.text || "").join("");
        const raw = parseSopJson(text);
        const norm = normalizeSopResult(raw, photos.length);
        if (!norm.steps.length) return Response.json({ error: "The AI didn’t return any steps — try again." }, { status: 502 });
        return Response.json({ ok: true, title: norm.title, steps: norm.steps });
      } catch {
        return Response.json({ error: "The AI returned an unreadable result — try again." }, { status: 502 });
      }
    }
    const msg = j?.error?.message || `AI error ${r.status}`;
    if (r.status === 401) return Response.json({ error: "The Anthropic key is invalid." }, { status: 502 });
    if (/credit|quota|billing|insufficient/i.test(msg)) return Response.json({ error: "AI is paused — the Anthropic account is out of credits." }, { status: 402 });
    lastErr = msg;
    if ([429, 500, 529].includes(r.status) && attempt < 2) { await new Promise((s) => setTimeout(s, 2500 * (attempt + 1))); continue; }
    break;
  }
  return Response.json({ error: lastErr }, { status: 502 });
}
