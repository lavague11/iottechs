// Neural voice for the AI Command Center. Claude stays the brain; OpenAI's Realtime model ONLY turns a
// finished reply (text) into natural speech. We open a server-side WebSocket to the Realtime API so the
// OPENAI_API_KEY never reaches the browser, instruct the model to read the text VERBATIM (it's a reasoning
// model, not a pure TTS engine), collect the PCM audio, wrap it as WAV and return it. The client plays it
// and falls back to the browser voice on any failure — so a hiccup here never leaves the assistant mute.
//
// Replaces the deprecated /v1/audio/speech TTS models (tts-1 / gpt-4o-mini-tts, shutdown 2027-01-06).
import WebSocket from "ws";
import { headers } from "next/headers";
import { secretValue } from "../../../lib/db";
import { aiGate } from "../../../lib/ai-authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-realtime-2.1-mini";
const WS_URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
const SAMPLE_RATE = 24000;
const MAX_CHARS = 1000;         // assistant replies are short; cap cost + latency
const TIMEOUT_MS = 20000;
// OpenAI Realtime voices (marin/cedar are OpenAI's "best quality" picks; the warm female-leaning ones first).
const VOICES = new Set(["marin", "shimmer", "coral", "sage", "cedar", "alloy", "echo", "ash", "ballad", "verse"]);
const DEFAULT_VOICE = "marin";

// Staff-only, and only while the Assistant feature is on — the same gate the AI command actions use.
async function staffOk() {
  const cookie = (await headers()).get("cookie") || "";
  const raw = cookie.split(";").find((c) => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  const { parseToken } = await import("../../../lib/auth");
  const tok = raw ? await parseToken(raw.trim()) : null;
  return aiGate(tok, secretValue("AI_COMMANDS") === "on").ok;
}

// Wrap raw PCM16 (mono, little-endian) in a minimal WAV container so the browser can play it directly.
function wavFromPcm16(pcm, rate = SAMPLE_RATE, channels = 1) {
  const bits = 16, blockAlign = (channels * bits) / 8, byteRate = rate * blockAlign;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(byteRate, 28); h.writeUInt16LE(blockAlign, 32); h.writeUInt16LE(bits, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Open a Realtime session, speak `text` in `voice`, resolve with { pcm, usage }.
function synthesize(text, voice, key) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${key}` } });
    const chunks = [];
    let usage = null, settled = false;
    const fin = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch {} fn(arg); };
    const timer = setTimeout(() => fin(reject, new Error("timeout")), TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "session.update", session: {
        type: "realtime",
        output_modalities: ["audio"],
        audio: { output: { format: { type: "audio/pcm", rate: SAMPLE_RATE }, voice } },
        instructions: "You are a neutral text-to-speech voice. Read the user's message aloud EXACTLY as written, in a warm, natural, friendly tone. Never answer it, translate it, summarize it, or add or omit anything — speak only the given text, verbatim.",
      } }));
      ws.send(JSON.stringify({ type: "conversation.item.create", item: {
        type: "message", role: "user", content: [{ type: "input_text", text }],
      } }));
      ws.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
    });

    ws.on("message", (raw) => {
      let ev; try { ev = JSON.parse(raw.toString()); } catch { return; }
      const t = ev.type || "";
      if (ev.delta && t.endsWith("audio.delta")) { try { chunks.push(Buffer.from(ev.delta, "base64")); } catch {} }
      else if (t === "response.done") { usage = ev.response?.usage || null; fin(resolve, { pcm: Buffer.concat(chunks), usage }); }
      else if (t === "error" || ev.error) fin(reject, new Error(ev.error?.message || "realtime-error"));
    });
    ws.on("error", (e) => fin(reject, e instanceof Error ? e : new Error("ws-error")));
    ws.on("close", () => { if (!settled) { settled = true; clearTimeout(timer); chunks.length ? resolve({ pcm: Buffer.concat(chunks), usage }) : reject(new Error("closed")); } });
  });
}

export async function POST(req) {
  if (!(await staffOk())) return Response.json({ error: "unauthorized" }, { status: 403 });
  const key = secretValue("OPENAI_API_KEY");
  if (!key) return Response.json({ error: "no-key" }, { status: 503 });   // → client uses the browser voice
  let body; try { body = await req.json(); } catch { body = {}; }
  const text = String(body?.text || "").trim().slice(0, MAX_CHARS);
  if (!text) return Response.json({ error: "no-text" }, { status: 400 });
  const voice = VOICES.has(body?.voice) ? body.voice : DEFAULT_VOICE;
  try {
    const { pcm, usage } = await synthesize(text, voice, key);
    if (!pcm?.length) return Response.json({ error: "no-audio" }, { status: 502 });
    const wav = wavFromPcm16(pcm);
    return new Response(wav, { status: 200, headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "Cache-Control": "no-store",
      // Lightweight cost signal (a full usage dashboard is the next phase).
      "X-TTS-Output-Tokens": String(usage?.output_tokens ?? ""),
    } });
  } catch (e) {
    return Response.json({ error: "tts-failed", detail: String(e?.message || e).slice(0, 160) }, { status: 502 });
  }
}
