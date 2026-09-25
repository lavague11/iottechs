import crypto from "node:crypto";
import { secretValue, insertMedia, getMedia, getJobByAccessId } from "../../../lib/db";
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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_BYTES = 25 * 1024 * 1024;
const PDF = "application/pdf";
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const PROMPT = `You read a contractor's PROPOSAL / QUOTE / ESTIMATE (security cameras, access control, alarm, audio, low-voltage, POS cabling) and return its content as JSON.

Return ONLY a JSON object. No preamble, no markdown fences.

{
  "customer": "customer or business name as printed, or null",
  "date": "YYYY-MM-DD or null",
  "proposal_number": "as printed, or null",
  "items": [
    { "name": "line item name", "description": "extra description or null", "qty": number or null, "unit_price": number or null, "total": number or null, "section": "section heading or null", "confidence": "high" | "low" }
  ],
  "subtotal": number or null, "discount": number or null, "tax": number or null, "total": number or null,
  "payment_terms": "as printed, or null", "notes": "customer-facing notes or null", "exclusions": "or null", "warranty": "or null",
  "uncertain": ["field names or item names you could not read reliably"]
}

Rules: never invent a value — a field the document does not clearly show is null. Keep quantity, unit price and line total separate (do not put a line total in unit_price). Parse "$1,250.00" as 1250. Mark an item "low" confidence when any of its numbers is unclear. If the document is scanned or blurry, still extract what is legible and list the rest under "uncertain".`;

function extractJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function extract(bytes, mime, key) {
  const data = Buffer.from(bytes).toString("base64");
  const block = mime === PDF ? { type: "document", source: { type: "base64", media_type: PDF, data } } : { type: "image", source: { type: "base64", media_type: mime, data } };
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }] }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `upstream ${res.status}`);
  const text = Array.isArray(j?.content) ? j.content.map((c) => c.text || "").join("") : "";
  const raw = extractJson(text);
  if (!raw) throw new Error("unparsable");
  return normalizeCandidate(raw);
}

export async function POST(req) {
  const user = await getSessionUser();
  if (!user?.id || !can(user.role, "proposal.reuse")) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
  const key = secretValue("ANTHROPIC_API_KEY");
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
  if (!key) return Response.json({ ok: true, mediaId, candidate: null, error: "ANTHROPIC_API_KEY is not set — add it in Development ▸ API Keys, or start manually." });
  try {
    const candidate = await extract(bytes, mime, key);
    return Response.json({ ok: true, mediaId, candidate });
  } catch (e) {
    return Response.json({ ok: true, mediaId, candidate: null, error: `Couldn't read the document (${e?.message || e}).` });
  }
}
