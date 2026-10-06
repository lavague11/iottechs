import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import {
  secretValue, customerOwnsProjectAccount,
  saveSiteIntelRun, getSiteIntelRunByHash, getLatestSiteIntelRun,
} from "../../../lib/db";
import { validateSiteIntel, siteIntelPrompt, shouldReuseRun } from "../../../lib/site-intel";

// Phase 7 "Site Intelligence": server-side OpenAI VISION analysis of the real aerial. Suggestion-
// first and cost-safe — identical (image + context) inputs reuse a stored run instead of re-billing;
// the model is never trusted past validateSiteIntel(); the key never leaves the server. The client
// (a separate task) draws the returned polygons as review-only suggestions.
export const runtime = "nodejs";

// Vision model, consistent with proposal-import's Responses-API usage; overridable from the vault.
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";
const MAX_OUTPUT_TOKENS = 4000;

// --- Auth (mirrors app/api/tool-data/route.js) ------------------------------------------------
async function getSessionRole() {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  if (raw) { const tok = await parseToken(raw); if (tok?.role) return tok; }
  const acc = jar.get("iot_access")?.value;
  if (acc) { const at = await parseAccessToken(acc); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}
function customerOwnsProject(tok, accessId) {
  if (tok?.viaPin) return String(tok.accessId) === String(accessId);
  return customerOwnsProjectAccount(accessId, { userId: tok?.id, email: tok?.email });
}
async function canReadProject(tok, accessId) {
  if (!tok) return false;
  if (["admin", "manager", "sales"].includes(tok.role)) return true;
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  if (tok.role === "customer") return customerOwnsProject(tok, accessId);
  return tok.role === "tech";
}
const EDITORS = ["admin", "manager", "sales"];

function configured() { return !!secretValue("OPENAI_API_KEY"); }

// GET ?accessId=&floorId=  → { ok, configured, latest }
// GET ?probe=1             → { configured } (staff session, no project needed)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tok = await getSessionRole();

  if (searchParams.get("probe") === "1") {
    const staff = tok && ["admin", "manager", "sales", "tech"].includes(tok.role);
    if (!staff) return Response.json({ ok: false }, { status: 403 });
    return Response.json({ ok: true, configured: configured() });
  }

  const accessId = searchParams.get("accessId");
  const floorId = searchParams.get("floorId");
  if (!accessId) return Response.json({ ok: false }, { status: 400 });
  if (!(await canReadProject(tok, accessId))) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, configured: configured(), latest: getLatestSiteIntelRun(accessId, floorId ?? null) });
}

// POST { accessId, floorId, sourceHash, image, grid, transform, north, structure, metadata, zones, analyzeAgain? }
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  const { accessId, floorId = null, sourceHash, analyzeAgain } = body || {};

  // Auth: writers only (admin/manager/sales); a PIN grant must match the project. (Mirror tool-data POST.)
  const tok = await getSessionRole();
  if (!tok) return Response.json({ error: "Session expired." }, { status: 403 });
  if (!EDITORS.includes(tok.role)) return Response.json({ error: "Read-only for your role." }, { status: 403 });
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return Response.json({ error: "Not your project." }, { status: 403 });
  if (!accessId || !sourceHash) return Response.json({ error: "Missing accessId or sourceHash." }, { status: 400 });

  // Gate: no key → 503, same shape as Enhance.
  const key = secretValue("OPENAI_API_KEY");
  if (!key) return Response.json({ error: "Site Intelligence isn't configured — add OPENAI_API_KEY in Development ▸ API Keys." }, { status: 503 });

  // COST PROTECTION: an identical source already analyzed → reuse it, NO OpenAI call.
  const existing = getSiteIntelRunByHash(accessId, floorId, sourceHash);
  if (shouldReuseRun(existing, analyzeAgain)) {
    return Response.json({ ok: true, reused: true, run: existing });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!image) return Response.json({ error: "No image." }, { status: 400 });

  const model = secretValue("SITE_INTEL_MODEL") || DEFAULT_MODEL;
  const prompt = siteIntelPrompt();
  const runId = randomUUID();
  const byName = tok.name || tok.email || tok.role;
  const context = { grid: body.grid, transform: body.transform, north: body.north, structure: body.structure, metadata: body.metadata, zones: body.zones };

  let result;
  try {
    result = await runSiteIntel(key, model, prompt, image, context);
  } catch (e) {
    // Persist the failure (audit + so the client can show "analysis failed"), then a clean 502.
    // NO automatic retry — the client decides whether to call again with analyzeAgain.
    try {
      saveSiteIntelRun({ id: runId, accessId, floorId, sourceHash, provider: "openai", model, status: "error",
        usage: null, payload: { error: String(e?.message || "analysis failed").slice(0, 300) }, createdBy: byName });
    } catch {}
    return Response.json({ error: e?.name === "AbortError" ? "Analysis timed out." : "Analysis failed." }, { status: 502 });
  }

  // Never trust raw model output past the validator.
  const payload = validateSiteIntel(result.raw, { runId, sourceRevision: body?.structure?.revision ?? null });
  const run = saveSiteIntelRun({ id: runId, accessId, floorId, sourceHash, provider: "openai", model,
    status: "done", usage: result.usage || null, payload, createdBy: byName });
  return Response.json({ ok: true, run });
}

// Isolated OpenAI call. ONE request, modest tokens, hard timeout, no retry loop. Returns the parsed
// raw model JSON + token usage; throws on any upstream/parse error so POST can persist 'error'.
async function runSiteIntel(key, model, prompt, image, context) {
  // Normalize the image to a data URL the Responses API accepts.
  const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
  const ctxText = `CONTEXT (JSON): ${JSON.stringify(context ?? {})}`;
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [
        { type: "input_image", image_url: imageUrl, detail: "high" },
        { type: "input_text", text: `${prompt}\n\n${ctxText}` },
      ] }],
      text: { format: { type: "json_object" } },
      reasoning: { effort: "low" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `upstream ${res.status}`);
  const text = j?.output_text
    || (Array.isArray(j?.output) ? j.output.flatMap((o) => o?.content || []).map((c) => c?.text || "").join("") : "");
  const raw = parseJson(text);
  if (!raw) throw new Error("unparsable model response");
  return { raw, usage: j?.usage || null };
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
