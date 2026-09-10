import { secretValue } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// Polish dictated text with Claude Haiku — fixes grammar, punctuation, capitalization and drops filler
// ("um", "uh", "like"), keeping the person's meaning and wording. Tiny + cheap (~$0.0001 per note).
// Staff-only; the Anthropic key stays server-side (vault → env), same as the camera auto-namer.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const PROMPT = `Clean up this dictated note, which may be in ANY language (English, Spanish, French, Arabic, Chinese, etc.). Fix grammar, punctuation, capitalization and spacing in that SAME language; remove speech filler and false starts; keep the writer's own language, words, meaning and tone. Do NOT translate, do NOT add information, do NOT answer or summarize. Return ONLY the cleaned text with no preamble, quotes, or commentary.`;

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager", "sales", "tech"].includes(user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const text = String(body?.text || "").trim();
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  if (text.length > 6000) return Response.json({ ok: true, text }); // too long to bother — return as-is

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [{ role: "user", content: `${PROMPT}\n\n---\n${text}` }],
      }),
    });
    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      console.error("clean-dictation anthropic error", upstream.status, t.slice(0, 200));
      return Response.json({ ok: true, text }); // fail soft — keep the raw dictation
    }
    const j = await upstream.json();
    const out = (j?.content?.[0]?.text || "").trim();
    return Response.json({ ok: true, text: out || text });
  } catch (e) {
    console.error("clean-dictation error", e?.message);
    return Response.json({ ok: true, text }); // fail soft
  }
}
