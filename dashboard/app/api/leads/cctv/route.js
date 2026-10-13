import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createLeadProject, insertMedia, saveCctvQuoteLead } from "../../../../lib/db";
import { processImage } from "../../../../lib/media-process";

// Public lead intake for the /build CCTV quote calculator. UNAUTHENTICATED by design (a customer on the
// public site). It validates the submitted quote snapshot, creates a real lead through the ONE canonical
// path (db.createLeadProject — reuses the customer by email/phone, else creates one), stores the floor
// plan (when provided) against the project, and keeps the full quote snapshot for the office. The snapshot
// carries internal sizing/flags the customer never sees; that's fine server-side — it is never served back
// to a customer. Abuse note: add rate-limiting / a captcha before heavy promotion (see handoff §8).
export const runtime = "nodejs";

const MAX_FILE = 20 * 1024 * 1024;   // 20 MB (the calculator caps the upload at 15 MB)
const OK_MIME = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/i;

function cap(s) {
  return String(s || "").trim().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
const dollars = (cents) => "$" + Math.round((Number(cents) || 0) / 100).toLocaleString("en-US");

export async function POST(req) {
  let form;
  try { form = await req.formData(); }
  catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }

  let snapshot;
  try { snapshot = JSON.parse(String(form.get("snapshot") || "")); } catch { snapshot = null; }
  if (!snapshot || typeof snapshot !== "object" || !snapshot.calcVersion) {
    return Response.json({ ok: false, error: "missing or invalid snapshot" }, { status: 400 });
  }

  const c = (snapshot.inputs && snapshot.inputs.contact) || {};
  const name = cap(c.name);
  const email = String(c.email || "").trim();
  const phone = String(c.phone || "").trim();
  const address = String(c.address || "").trim();
  const company = String(c.company || "").trim();
  // Minimal validation for a public lead: a name, a way to reach them (email OR 10-digit phone), and where.
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  if (!name || !address || (!emailOk && !phoneOk)) {
    return Response.json({ ok: false, error: "incomplete contact details" }, { status: 400 });
  }

  // Create the lead through the canonical path — CCTV → the "SC" (Security Cameras) service.
  let created;
  try {
    created = createLeadProject(name, email || null, phone || null, address, "CCTV", company || null, null, {});
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "could not create the lead" }, { status: 400 });
  }
  const { accessId } = created;

  // Floor plan (optional) → stored against the project. A failure here never loses the lead.
  let floorplanMediaId = null;
  const file = form.get("floorplan");
  if (file && typeof file !== "string" && typeof file.arrayBuffer === "function" && OK_MIME.test(file.type || "")) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length && buf.length <= MAX_FILE) {
        const id = crypto.randomBytes(16).toString("hex");
        if (/^image\//i.test(file.type) && !/heic|heif/i.test(file.type)) {
          const img = await processImage(buf, file.name, file.type);   // normalize/convert raster images
          insertMedia({ id, projectAccessId: accessId, kind: "site", mime: img.mime, bytes: img.bytes, w: img.w, h: img.h, createdBy: "web-lead" });
        } else {
          insertMedia({ id, projectAccessId: accessId, kind: "site", mime: file.type || "application/octet-stream", bytes: buf, w: null, h: null, createdBy: "web-lead" });
        }
        floorplanMediaId = id;
      }
    } catch (e) { console.error("[leads/cctv] floorplan store failed:", e?.message || e); }
  }

  // Keep the full quote snapshot for the office + a one-line summary on the project.
  try {
    const st = snapshot.storage || {};
    const cams = (snapshot.inputs && snapshot.inputs.cams) || "?";
    const summary = `CCTV quote ${snapshot.id || ""} · ${cams} camera${cams === 1 ? "" : "s"}`
      + ` · ${st.selectedNvr || "recorder TBD"} · ${st.selectedStorageTB || "?"}TB ≈ ${st.estimatedRetentionDays || "?"} days`
      + ` · ${dollars(snapshot.total)} (from the website).`;
    saveCctvQuoteLead({
      quoteId: snapshot.id, accessId, total: snapshot.total, snapshot,
      text: String(form.get("text") || ""), floorplanMediaId, summary,
    });
  } catch (e) { console.error("[leads/cctv] save quote failed:", e?.message || e); }

  revalidatePath("/", "layout");   // the new lead shows up in the office lists immediately
  return Response.json({ ok: true, accessId, quoteId: snapshot.id || null, floorplanMediaId });
}
