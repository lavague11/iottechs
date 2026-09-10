import { secretValue, setBugFixPrompt } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";

// One-click "fix prompt": Claude Haiku rewrites a user's bug report into a crisp, self-contained task
// prompt for a coding agent — it states the problem precisely (no solutions), so you can copy it and
// hand it straight to Claude Code / an agent to fix. Staff-only; tiny + cheap; never changes code.
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
  const id = body?.id;
  const shots = Number(body?.shots) || 0;
  const error = String(body?.error || "").trim().slice(0, 300);

  const prompt = `Rewrite this user's bug report into a clear, self-contained task prompt for a coding agent working on an internal web app (Next.js App Router + React, node:sqlite, a deck-style project UI).

User report: "${desc}"${path ? `\nReported from the page: ${path}` : ""}${shots > 1 ? `\nThe reporter attached ${shots} annotated screenshots capturing the issue across states — assume they show the sequence/variants of the problem.` : ""}${error ? `\nA runtime error was captured around the same time (use it as a strong clue, but the user's described problem is what matters): ${error}` : ""}

State the PROBLEM precisely and unambiguously: what the buggy behavior is, where in the app it happens, and what the correct/expected behavior should be. Write it as a direct instruction that starts with "Fix this bug:". Do NOT propose solutions, do NOT list steps, and do NOT name files or components — only describe the problem so the agent can investigate and fix it. If a key detail is missing, note the one thing that would help. ALWAYS write the prompt in ENGLISH — if the report is in another language, translate it to English. Output ONLY the prompt text, no preamble or quotes.`;

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
    if (out && id) { try { setBugFixPrompt(id, out); } catch { /* non-fatal — still return it */ } }
    return Response.json({ ok: true, suggestion: out });
  } catch (e) {
    console.error("bug-suggest error", e?.message);
    return Response.json({ error: "AI error." }, { status: 502 });
  }
}
