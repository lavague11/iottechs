import { secretValue } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// Server-side proxy for the ID Scanner's Claude vision calls. The Anthropic key
// NEVER reaches the browser — it's read from the vault (Development ▸ API Keys)
// or env and injected here. Staff-only; a licence image is sensitive.
//
// The client (id-capture.jsx) posts { model, max_tokens, stream, messages } exactly
// as it would to Anthropic; we validate, add auth, and stream the reply straight back.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Only vision-capable models this tool actually uses — an allowlist so the proxy
// can't be repurposed into an open Anthropic relay.
const ALLOWED_MODELS = new Set(["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-5", "claude-opus-4-8"]);
const DEFAULT_MODEL = "claude-haiku-4-5";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Forbidden", { status: 403 });

  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set — add it in Development ▸ API Keys." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!Array.isArray(body?.messages) || !body.messages.length) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }
  const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  const max_tokens = Math.min(Math.max(Number(body.max_tokens) || 1000, 1), 2000);
  const stream = body.stream === true;

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, stream, messages: body.messages }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    console.error("read-licence upstream failed", e);
    return Response.json({ error: "Reader unavailable — try again." }, { status: 504 });
  }

  // Stream the SSE body straight through so the live field-fill keeps working.
  if (stream && upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  }
  // Non-streaming fallback the client uses if the stream fails.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
