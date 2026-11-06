import crypto from "node:crypto";
import { secretValue, insertMedia, getMedia, getJobByAccessId, logProjectEvent } from "../../../lib/db";
import { getSessionUser } from "../../../lib/session";
import { can } from "../../../lib/roles";
import { normalizeCandidate } from "../../../lib/proposal-reuse";

// Import an old proposal document (PDF first; JPEG/PNG scans too). Two steps in one route:
//   POST multipart { file, project }  → stores the ORIGINAL as media kind "proposal-import" (the
//   source attachment) and runs the extraction → returns { ok, mediaId, candidate } for IMPORT REVIEW.
//   POST json { mediaId, project }    → re-run the extraction on a stored file (Retry extraction).
// The extraction is an assistant, not authority: nothing becomes a proposal until the user confirms
// the reviewed candidate (createProposalFromImportAction). Staff only; the key never leaves the server.
export const runtime = "nodejs";

// Extraction runs on Claude (Anthropic Messages API, native PDF document input), Sonnet-class — the
// user's choice for this. OpenAI (Responses API) is the fallback when no Anthropic key is in the vault.
// Both models overridable from the vault. Token usage → a per-import API cost, logged to the project.
const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.4-mini";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const MAX_BYTES = 25 * 1024 * 1024;
const PDF = "application/pdf";
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// $ per 1M tokens (Sonnet-class). Overridable from the vault if pricing changes.
const CLAUDE_IN_PER_M = 3, CLAUDE_OUT_PER_M = 15;
const OPENAI_IN_PER_M = 0.25, OPENAI_OUT_PER_M = 2;

const PROMPT = `You are reading a low-voltage contractor's PROPOSAL / QUOTE / ESTIMATE (security cameras, access control, alarm, audio, POS cabling). Return its content as JSON.

Return ONLY a JSON object. No preamble, no markdown fences.

{
  "customer": "the CUSTOMER / recipient this proposal is FOR (the 'Prepared For' party or project site), or null",
  "customer_address": "the customer's project / service address, or null",
  "customer_phone": "a phone that is clearly the customer's (NOT the contractor's), or null",
  "customer_email": "an email that is clearly the customer's (NOT the contractor's), or null",
  "date": "YYYY-MM-DD or null",
  "proposal_number": "as printed, or null",
  "systems": [
    {
      "name": "the system name exactly as printed, e.g. 'System 1 — Store Interior + Exterior'",
      "coverage": "the coverage / area description for this system, or null",
      "cameras": number of cameras in this system, or null,
      "nvr": "the NVR / recorder spec, e.g. '32-Ch', or null",
      "storage": "the storage spec, e.g. '5x8TB', or null",
      "total": this system's own total price as a number, or null,
      "items": [
        { "name": "line item description", "qty": number or null, "unit_price": number or null, "total": number or null, "confidence": "high" | "low" }
      ]
    }
  ],
  "subtotal": number or null, "discount": number or null, "tax": number or null, "total": the GRAND total as a number, or null,
  "payment_terms": "as printed or null", "notes": "customer-facing notes or null", "exclusions": "or null", "warranty": "or null",
  "uncertain": ["field or item names you could not read reliably"]
}

CRITICAL rules:
- CUSTOMER ONLY. This document was WRITTEN BY the contractor "IOT TECHS" (by La Vague Inc). NEVER return IOT TECHS, La Vague, "Assigned Contractor", their phone (646-396-0775), email (support@iot-techs.com) or website (iot-techs.com) as the customer or customer contact. The customer is the "Prepared For" party / project site (e.g. "Fuel Gas Station Hub").
- Detect EACH separate camera system as its own entry in "systems" (System 1, System 2, System 3, …), each with its coverage, camera count, NVR, storage, total, and its own line items.
- Put every line item UNDER its system. Keep quantity, unit price and line total separate (never put a line total in unit_price). Parse "$1,250.00" as 1250.
- Never invent a value — a field the document doesn't clearly show is null. Mark an item "low" confidence when any of its numbers is unclear, and list anything you couldn't read under "uncertain".`;

function extractJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function extractOpenAI(bytes, mime, key, model) {
  const data = Buffer.from(bytes).toString("base64");
  const block = mime === PDF
    ? { type: "input_file", filename: "proposal.pdf", file_data: `data:${PDF};base64,${data}` }
    : { type: "input_image", image_url: `data:${mime};base64,${data}`, detail: "high" };
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [block, { type: "input_text", text: PROMPT }] }],
      text: { format: { type: "json_object" } },
      reasoning: { effort: "low" },
      max_output_tokens: 6000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `upstream ${res.status}`);
  const text = j?.output_text
    || (Array.isArray(j?.output) ? j.output.flatMap((o) => o?.content || []).map((c) => c?.text || "").join("") : "");
  const raw = extractJson(text);
  if (!raw) throw new Error("unparsable");
  const u = j?.usage || {};
  const inTok = +u.input_tokens || +u.prompt_tokens || 0, outTok = +u.output_tokens || +u.completion_tokens || 0;
  return { candidate: normalizeCandidate(raw), usage: { inTok, outTok, cost: inTok / 1e6 * OPENAI_IN_PER_M + outTok / 1e6 * OPENAI_OUT_PER_M } };
}

async function extractClaude(bytes, mime, key, model) {
  const data = Buffer.from(bytes).toString("base64");
  const block = mime === PDF ? { type: "document", source: { type: "base64", media_type: PDF, data } } : { type: "image", source: { type: "base64", media_type: mime, data } };
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }] }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `upstream ${res.status}`);
  const text = Array.isArray(j?.content) ? j.content.map((c) => c.text || "").join("") : "";
  const raw = extractJson(text);
  if (!raw) throw new Error("unparsable");
  const u = j?.usage || {};
  const inTok = +u.input_tokens || 0, outTok = +u.output_tokens || 0;
  return { candidate: normalizeCandidate(raw), usage: { inTok, outTok, cost: inTok / 1e6 * CLAUDE_IN_PER_M + outTok / 1e6 * CLAUDE_OUT_PER_M } };
}

// Which engine reads the document: Claude (Anthropic) when its key is in the vault — the user's choice —
// else OpenAI as the fallback. Never both.
function engine() {
  const anthropic = secretValue("ANTHROPIC_API_KEY");
  if (anthropic) return { name: "claude", key: anthropic, model: secretValue("ANTHROPIC_IMPORT_MODEL") || ANTHROPIC_MODEL };
  const openai = secretValue("OPENAI_API_KEY");
  if (openai) return { name: "openai", key: openai, model: secretValue("OPENAI_IMPORT_MODEL") || OPENAI_MODEL };
  return null;
}

export async function POST(req) {
  const user = await getSessionUser();
  if (!user?.id || !can(user.role, "proposal.reuse")) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
  const eng = engine();
  const ct = req.headers.get("content-type") || "";

  let mediaId, bytes, mime, project;
  if (ct.includes("application/json")) {
    let body; try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
    mediaId = String(body?.mediaId || ""); project = String(body?.project || "");
    const m = getMedia(mediaId);
    if (!m || m.kind !== "proposal-import" || String(m.project_access_id).toUpperCase() !== project.toUpperCase()) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    bytes = m.bytes; mime = m.mime;
  } else {
    let form; try { form = await req.formData(); } catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }
    const file = form.get("file"); project = String(form.get("project") || "");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return Response.json({ ok: false, error: "no file" }, { status: 400 });
    if (!getJobByAccessId(project)) return Response.json({ ok: false, error: "project not found" }, { status: 404 });
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return Response.json({ ok: false, error: "empty file" }, { status: 400 });
    if (buf.length > MAX_BYTES) return Response.json({ ok: false, error: "file too large" }, { status: 413 });
    mime = String(file.type || "").toLowerCase();
    if (mime !== PDF && !IMAGE.has(mime)) {
      // Sniff a PDF with a wrong/missing type; anything else is refused.
      if (buf.slice(0, 5).toString() === "%PDF-") mime = PDF;
      else return Response.json({ ok: false, error: "PDF or image only" }, { status: 415 });
    }
    // Keep the ORIGINAL as the import's source attachment (kind "proposal-import"), whatever happens next.
    mediaId = crypto.randomBytes(16).toString("hex");
    insertMedia({ id: mediaId, projectAccessId: project, kind: "proposal-import", mime, bytes: buf, w: null, h: null, createdBy: user.name || user.role });
    bytes = buf;
  }
  if (!eng) return Response.json({ ok: true, mediaId, candidate: null, error: "No AI key set — add ANTHROPIC_API_KEY (or OPENAI_API_KEY) in Development ▸ API Keys, or start manually." });
  try {
    const { candidate, usage } = eng.name === "openai" ? await extractOpenAI(bytes, mime, eng.key, eng.model) : await extractClaude(bytes, mime, eng.key, eng.model);
    const cost = Math.round((usage?.cost || 0) * 10000) / 10000;   // $ to 4dp
    // Log the per-import API cost to the project (visible in the Job Log).
    try { logProjectEvent(project, { kind: "ai", label: `Proposal import parsed · ${eng.name === "claude" ? "Claude" : "OpenAI"} ${eng.model} · ${(usage?.inTok || 0) + (usage?.outTok || 0)} tok · $${cost.toFixed(4)}`, actor: user.name || user.role }); } catch { /* non-fatal */ }
    return Response.json({ ok: true, mediaId, candidate, engine: eng.name, model: eng.model, usage: { ...usage, cost } });
  } catch (e) {
    return Response.json({ ok: true, mediaId, candidate: null, error: `Couldn't read the document (${e?.message || e}).` });
  }
}
