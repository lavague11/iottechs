import { secretValue, getMedia, setBugUiPrompt } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// Vision UI review: Claude looks at the bug's screenshot(s) and returns a self-contained coding-agent
// prompt — the concrete UI/UX issues it can see, plus how to make the screen more advanced and polished
// (against the project's minimal, icon-first design constitution). Staff-only; result is persisted.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";   // multimodal — reads the screenshot directly
const MAX_IMAGES = 3;

// Pull the media id out of a "/api/media/<id>" (or absolute) URL, then load its bytes as base64.
function mediaImageBlock(url) {
  try {
    const id = String(url).split("/api/media/")[1]?.split(/[?#]/)[0];
    if (!id) return null;
    const m = getMedia(id);
    if (!m || m.voided || !m.bytes) return null;
    const b64 = Buffer.from(m.bytes).toString("base64");
    return { type: "image", source: { type: "base64", media_type: m.mime || "image/jpeg", data: b64 } };
  } catch { return null; }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });

  let body; try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = body?.id;
  const path = String(body?.path || "").trim();
  const desc = String(body?.description || "").trim().slice(0, 600);
  const urls = Array.isArray(body?.imageUrls) && body.imageUrls.length ? body.imageUrls : (body?.imageUrl ? [body.imageUrl] : []);
  const images = urls.slice(0, MAX_IMAGES).map(mediaImageBlock).filter(Boolean);
  if (!images.length) return Response.json({ error: "No screenshot to review." }, { status: 400 });

  const instruction = `You are a senior product designer reviewing a screenshot of an internal web app (IOT TECHS — Next.js + React, a minimal, icon-first "vault-dark/clean" design system: SVG icons, one- or two-word labels, compact controls, quiet hierarchy, no clutter).

Look carefully at the attached screenshot${images.length > 1 ? "s" : ""}${path ? ` (from ${path})` : ""}.${desc ? `\nThe reporter noted: "${desc}"` : ""}

Write a single, self-contained prompt for a coding agent that will UPGRADE this screen — make it more advanced, polished and usable — and fix any problems you can see. Structure it as:
ISSUES — the concrete UI/UX/layout/accessibility/visual problems visible in the screenshot (be specific: name the element and what's wrong).
IMPROVEMENTS — concrete, buildable changes that make it more advanced and refined (layout, hierarchy, spacing, states, affordances, responsiveness), consistent with a minimal icon-first system. No fluff, no generic advice — only what applies to THIS screen.
Start directly with "ISSUES". Do not restate these instructions or describe the screenshot in prose. Keep it tight and actionable.`;

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: "user", content: [...images, { type: "text", text: instruction }] }] }),
    });
    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      console.error("bug-ui-review anthropic error", upstream.status, t.slice(0, 200));
      return Response.json({ error: "AI unavailable — try again." }, { status: 502 });
    }
    const j = await upstream.json();
    const out = (j?.content?.[0]?.text || "").trim();
    if (out && id) { try { setBugUiPrompt(id, out); } catch { /* non-fatal */ } }
    return Response.json({ ok: true, review: out });
  } catch (e) {
    console.error("bug-ui-review error", e?.message);
    return Response.json({ error: "AI error." }, { status: 502 });
  }
}
