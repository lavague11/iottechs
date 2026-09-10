import { secretValue } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// One-click triage: given a bug report, Claude Haiku returns a likely root cause + concrete fix steps
// so the admin can act on it fast. Staff-only; tiny + cheap. Advisory only — it never changes code.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const key = secretValue("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });

  let body; try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const desc = String(body?.description || "").trim();
  if (!desc) return Response.json({ error: "empty" }, { status: 400 });
  const path = String(body?.path || "").trim();

  const prompt = `You are a senior engineer triaging a bug in an internal web app (Next.js App Router + React, node:sqlite, deck-style project UI). A user reported:

"${desc}"${path ? `\n\nReported from the page: ${path}` : ""}

Give a short, practical triage. Use exactly these three labelled lines, nothing else:
LIKELY CAUSE: <one sentence>
WHERE TO LOOK: <the most likely component/file/area, best guess>
FIX: <2-4 concrete steps>
Be specific and concise. If the report is too vague, say what one detail you'd need.`;

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      console.error("bug-suggest anthropic error", upstream.status, t.slice(0, 200));
      return Response.json({ error: "AI unavailable — try again." }, { status: 502 });
    }
    const j = await upstream.json();
    const out = (j?.content?.[0]?.text || "").trim();
    return Response.json({ ok: true, suggestion: out });
  } catch (e) {
    console.error("bug-suggest error", e?.message);
    return Response.json({ error: "AI error." }, { status: 502 });
  }
}
