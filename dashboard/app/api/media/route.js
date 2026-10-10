import crypto from "node:crypto";
import { cookies } from "next/headers";
import { parseAccessToken, parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { insertMedia } from "../../../lib/db";
import { processImage } from "../../../lib/media-process";

// HEIC-safe photo upload. iPhones shoot HEIC (HEVC), which most browsers can't decode, so we optimize
// uploads to a resized JPEG server-side (lib/media-process) and hand back a plain /api/media/:id URL the
// tools store instead of a multi-MB base64 data-URL. The optimizer (sharp) is OPTIONAL: when the host's
// native binary is missing or chokes, a web-safe image (PNG/JPEG/GIF/WebP — e.g. a bug screenshot) is
// stored as-is rather than 422ing; only HEIC truly needs conversion, done with pure-JS heic-convert.
export const runtime = "nodejs";

const MAX_BYTES = 30 * 1024 * 1024;   // 30MB raw upload cap (a HEIC is ~2–3MB; leaves headroom)

// Uploads are staff-only (surveyors/office). Customers view but never upload.
// Returns { name, role, accessId } — accessId is set for a project-PIN grant (the upload is then
// scoped to that project); role "applicant" is a hiring candidate (never a project upload).
async function principal() {
  const user = await getSessionUser();
  if (user?.id) return { name: user.name || user.role || "staff", role: user.role, accessId: null };
  const jar = await cookies();
  const acc = jar.get("iot_access")?.value;
  const at = acc ? await parseAccessToken(acc) : null;
  if (at?.role && at.role !== "customer") return { name: at.role, role: at.role, accessId: at.accessId };   // tech/staff via PIN
  const appTok = jar.get("iot_app")?.value;                 // a hiring candidate uploading their own compliance docs
  const ap = appTok ? await parseSvcToken(appTok) : null;
  if (ap?.svcId) return { name: `applicant:${ap.svcId}`, role: "applicant", accessId: null, appId: ap.svcId };
  return null;
}
async function principalName() { return (await principal())?.name || null; }
// Media kinds that count toward something (install photos gate a lifecycle step) must be declared.
const PROJECT_KINDS = new Set(["install", "install-issue", "survey-view", "survey", "camera", "device", "mockup", "bug", "note", "site"]);
const UPLOAD_ROLES = new Set(["admin", "manager", "sales", "tech"]);

export async function POST(req) {
  const p = await principal();
  const who = p?.name || null;
  if (!who) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });

  let form;
  try { form = await req.formData(); }
  catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }

  const file = form.get("file");
  const projectAccessId = form.get("project") || null;
  const kind = form.get("kind") || null;
  // Project scoping: an applicant never uploads to a project; a PIN grant only to ITS project; a
  // declared kind only (kind "install" feeds a lifecycle fact). Readonly/vendor never upload.
  if (projectAccessId) {
    if (p.role === "applicant") {
      // A candidate's compliance docs are keyed by THEIR application id and a compliance:* kind only.
      if (String(projectAccessId) !== String(p.appId) || !/^compliance:/.test(String(kind || ""))) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
    } else {
      if (!UPLOAD_ROLES.has(p.role)) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
      if (p.accessId && String(p.accessId).toUpperCase() !== String(projectAccessId).toUpperCase()) return Response.json({ ok: false, error: "not your project" }, { status: 403 });
      if (kind && !PROJECT_KINDS.has(String(kind))) return Response.json({ ok: false, error: "unknown kind" }, { status: 400 });
    }
  }
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return Response.json({ ok: false, error: "no file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return Response.json({ ok: false, error: "empty file" }, { status: 400 });
  if (buf.length > MAX_BYTES) return Response.json({ ok: false, error: "file too large" }, { status: 413 });

  let img;
  try { img = await processImage(buf, file.name, file.type); }
  catch (e) { console.error("[media] could not process image:", e?.message || e); return Response.json({ ok: false, error: "could not decode image: " + (e?.message || e) }, { status: 422 }); }

  const id = crypto.randomBytes(16).toString("hex");
  try {
    insertMedia({ id, projectAccessId, kind, mime: img.mime, bytes: img.bytes, w: img.w, h: img.h, createdBy: who });
  } catch (e) {
    return Response.json({ ok: false, error: "store failed: " + (e?.message || e) }, { status: 500 });
  }
  return Response.json({ ok: true, id, url: `/api/media/${id}`, w: img.w, h: img.h });
}
