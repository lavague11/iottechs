import crypto from "node:crypto";
import { cookies } from "next/headers";
import { parseAccessToken, parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { insertMedia } from "../../../lib/db";

// HEIC-safe photo upload. iPhones shoot HEIC (HEVC), which most desktops/browsers can't decode,
// so we convert EVERY upload to JPEG here — server-side — and hand back a plain /api/media/:id URL
// the tools store instead of a multi-MB base64 data-URL. sharp handles the resize/encode; if the
// input is HEIC and this platform's sharp lacks the HEVC decoder (common on prebuilt binaries),
// we fall back to heic-convert (pure-JS libheif with the decoder built in) so it works everywhere.
export const runtime = "nodejs";

const MAX_BYTES = 30 * 1024 * 1024;   // 30MB raw upload cap (a HEIC is ~2–3MB; leaves headroom)
const MAX_DIM = 1600;                 // longest edge of the stored JPEG

// ISO-BMFF ftyp sniff: HEIC/HEIF brands, in case the browser sent a blank/wrong MIME type.
function looksHeic(buf, name, type) {
  if (/hei[cf]/i.test(type || "")) return true;
  if (/\.(heic|heif)$/i.test(name || "")) return true;
  try {
    if (buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp") {
      const brand = buf.toString("latin1", 8, 24).toLowerCase();
      return /heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1/.test(brand);
    }
  } catch {}
  return false;
}

async function toJpeg(buf, name, type) {
  const sharp = (await import("sharp")).default;
  let jpegSource = buf;
  if (looksHeic(buf, name, type)) {
    try {
      // Fast path: some platforms' sharp CAN decode HEIC.
      jpegSource = await sharp(buf).jpeg().toBuffer();
    } catch {
      // Deterministic fallback: pure-JS decoder that always ships the HEVC decoder.
      const heicConvert = (await import("heic-convert")).default;
      const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
      jpegSource = Buffer.from(out);
    }
  }
  const out = await sharp(jpegSource)
    .rotate()   // bake in EXIF orientation so it's upright everywhere
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(out).metadata();
  return { bytes: out, w: meta.width || null, h: meta.height || null };
}

// Uploads are staff-only (surveyors/office). Customers view but never upload.
async function principalName() {
  const user = await getSessionUser();
  if (user?.id) return user.name || user.role || "staff";
  const jar = await cookies();
  const acc = jar.get("iot_access")?.value;
  const at = acc ? await parseAccessToken(acc) : null;
  if (at?.role && at.role !== "customer") return at.role;   // tech/staff via PIN
  const appTok = jar.get("iot_app")?.value;                 // a hiring candidate uploading their own compliance docs
  const ap = appTok ? await parseSvcToken(appTok) : null;
  if (ap?.svcId) return `applicant:${ap.svcId}`;
  return null;
}

export async function POST(req) {
  const who = await principalName();
  if (!who) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });

  let form;
  try { form = await req.formData(); }
  catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }

  const file = form.get("file");
  const projectAccessId = form.get("project") || null;
  const kind = form.get("kind") || null;
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return Response.json({ ok: false, error: "no file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return Response.json({ ok: false, error: "empty file" }, { status: 400 });
  if (buf.length > MAX_BYTES) return Response.json({ ok: false, error: "file too large" }, { status: 413 });

  let jpeg;
  try { jpeg = await toJpeg(buf, file.name, file.type); }
  catch (e) { return Response.json({ ok: false, error: "could not decode image: " + (e?.message || e) }, { status: 422 }); }

  const id = crypto.randomBytes(16).toString("hex");
  try {
    insertMedia({ id, projectAccessId, kind, mime: "image/jpeg", bytes: jpeg.bytes, w: jpeg.w, h: jpeg.h, createdBy: who });
  } catch (e) {
    return Response.json({ ok: false, error: "store failed: " + (e?.message || e) }, { status: 500 });
  }
  return Response.json({ ok: true, id, url: `/api/media/${id}`, w: jpeg.w, h: jpeg.h });
}
