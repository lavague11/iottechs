import crypto from "node:crypto";
import { getSessionUser } from "../../../lib/session";
import { insertMedia } from "../../../lib/db";
import { processImage } from "../../../lib/media-process";

// Receipt upload for an expense — staff only. Accepts a PDF or an image (JPG/PNG/HEIC/WebP) up to 10MB.
// Images are optimized (HEIC→JPEG) via the shared pipeline; PDFs are stored as-is. Served back, gated, from
// /api/receipt/[id]. Stored in the `media` table with kind "receipt" (no project scope required).
export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager"].includes(user.role)) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });

  let form;
  try { form = await req.formData(); } catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return Response.json({ ok: false, error: "no file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return Response.json({ ok: false, error: "empty file" }, { status: 400 });
  if (buf.length > MAX_BYTES) return Response.json({ ok: false, error: "file too large (10MB max)" }, { status: 413 });

  const isPdf = /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
  let mime = file.type || "application/octet-stream", bytes = buf, w = null, h = null;
  if (!isPdf) {
    try { const img = await processImage(buf, file.name, file.type); mime = img.mime; bytes = img.bytes; w = img.w; h = img.h; }
    catch { return Response.json({ ok: false, error: "could not read that image — try a PDF, JPG or PNG" }, { status: 422 }); }
  }

  const id = crypto.randomBytes(16).toString("hex");
  try { insertMedia({ id, projectAccessId: null, kind: "receipt", mime, bytes, w, h, createdBy: user.name || user.role }); }
  catch (e) { return Response.json({ ok: false, error: "store failed: " + (e?.message || e) }, { status: 500 }); }
  return Response.json({ ok: true, id, url: `/api/receipt/${id}`, name: file.name || "receipt", pdf: isPdf });
}
