// Multilingual speech-to-text for the AI Command Center. The browser's Web Speech API can't auto-detect the
// spoken language (it locks to one `lang` per session) and is unreliable on iPhone Safari — so Conversation
// Mode and dictation record short audio clips and send them here. We call OpenAI Whisper with verbose_json,
// which RETURNS the detected language, so the assistant can understand and reply in English, Spanish, Arabic,
// etc. without the user ever picking a language. The OPENAI_API_KEY stays server-side.
//
// whisper-1 is used specifically because it reports the detected `language`; the gpt-4o-transcribe models are
// cheaper but only emit plain text (no language field), which would defeat auto-detection. ~$0.006/min.
import { secretValue } from "../../../lib/db";
import { voiceAllowed } from "../../../lib/voice-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "whisper-1";
const MAX_BYTES = 8 * 1024 * 1024;   // ~8MB — a short conversational clip; caps cost + latency
const TIMEOUT_MS = 20000;

// Whisper returns ISO-639-1 names ("english") or codes; fold to the app's short codes. Unknown → en.
const LANG_CODE = { english: "en", spanish: "es", arabic: "ar", en: "en", es: "es", ar: "ar" };
const toLang = (l) => LANG_CODE[String(l || "").toLowerCase()] || "en";

export async function POST(req) {
  const key = secretValue("OPENAI_API_KEY");
  if (!key) return Response.json({ error: "no-key" }, { status: 503 });

  let audio, project = null;
  try { const form = await req.formData(); audio = form.get("file") || form.get("audio"); project = form.get("project") || null; } catch { audio = null; }
  // Staff, OR a customer who owns the named project when the customer assistant is on (S3 — never widens aiGate).
  if (!(await voiceAllowed(project))) return Response.json({ error: "unauthorized" }, { status: 403 });
  if (!audio || typeof audio.arrayBuffer !== "function") return Response.json({ error: "no-audio" }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "too-large" }, { status: 413 });
  if (audio.size < 1200) return Response.json({ text: "", language: "en", empty: true });   // basically silence

  const out = new FormData();
  out.append("file", audio, audio.name || "clip.webm");
  out.append("model", MODEL);
  out.append("response_format", "verbose_json");   // gives us { text, language, duration }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: out, signal: controller.signal,
    });
    if (!res.ok) { const detail = (await res.text().catch(() => "")).slice(0, 160); return Response.json({ error: "stt-" + res.status, detail }, { status: 502 }); }
    const j = await res.json();
    return Response.json({
      text: String(j?.text || "").trim(),
      language: toLang(j?.language),
      duration: j?.duration ?? null,   // seconds of audio — a cost signal for the usage dashboard
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: "stt-failed", detail: String(e?.message || e).slice(0, 160) }, { status: 502 });
  } finally { clearTimeout(timer); }
}
