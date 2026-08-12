import { cookies } from "next/headers";
import { parseToken } from "../../../lib/auth";
import { secretValue, setSecret, deleteSecret } from "../../../lib/db";
import { DEFAULT_AERIAL, DEFAULT_FLOORPLAN, PROMPT_KEYS } from "../../../lib/survey-prompts";

export const runtime = "nodejs";

const DEFAULTS = { aerial: DEFAULT_AERIAL, floorplan: DEFAULT_FLOORPLAN };

async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor?.role === "admin" ? actor : null;
}

function snapshot(mode) {
  const override = secretValue(PROMPT_KEYS[mode]);
  return { current: override || DEFAULTS[mode], default: DEFAULTS[mode], custom: !!override };
}

// GET → current + default for both prompts (admin only; the survey tool hides the editor on 403).
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Admin only" }, { status: 403 });
  return Response.json({ aerial: snapshot("aerial"), floorplan: snapshot("floorplan") });
}

// POST { mode, prompt } → save an override; empty prompt resets that mode to its default.
export async function POST(req) {
  const actor = await requireAdmin();
  if (!actor) return Response.json({ error: "Admin only" }, { status: 403 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  const mode = body?.mode === "floorplan" ? "floorplan" : body?.mode === "aerial" ? "aerial" : null;
  if (!mode) return Response.json({ error: "Unknown prompt" }, { status: 400 });

  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) {
    deleteSecret(PROMPT_KEYS[mode]);                                   // reset → default
    return Response.json({ ok: true, ...snapshot(mode) });
  }
  if (prompt.length > 4000) return Response.json({ error: "Prompt too long (4000 max)." }, { status: 400 });
  const r = setSecret(PROMPT_KEYS[mode], prompt, actor.name || actor.email || "admin");
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({ ok: true, ...snapshot(mode) });
}
