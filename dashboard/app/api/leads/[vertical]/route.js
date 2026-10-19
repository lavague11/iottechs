import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createLeadProject, insertMedia, saveCctvQuoteLead } from "../../../../lib/db";
import { processImage } from "../../../../lib/media-process";

// GENERIC public lead intake for every BYS vertical (/build/<vertical>). UNAUTHENTICATED by design (a
// customer on the public site). The vertical comes from the URL (pos / audio / toast / …); the service
// LABEL comes from the client (SPEC.lead.service), which createLeadProject → serviceCodeFromText maps to the
// project's 2-letter code (POS/Toast → TP, Audio → AU, Alarm → AS, unknown → MX). The quote snapshot (which
// carries its own calcVersion = the vertical) is stored for the office. The cameras builder keeps its own
// /api/leads/cctv route (a static path beats this dynamic one), so this never shadows it.
// Abuse note: add rate-limiting / a captcha before heavy promotion.
export const runtime = "nodejs";

const MAX_FILE = 20 * 1024 * 1024;
const OK_MIME = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/i;

function cap(s) {
  return String(s || "").trim().replace(/\s+/g, " ").split(" ").map((w) => {
    if (!w) return w;
    if (/[a-z]/.test(w) && /[A-Z]/.test(w.slice(1))) return w;   // keep McDonald / O'Neill the client already mixed-cased
    return w.toLowerCase().replace(/(^|[-'’])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
  }).join(" ");
}
const dollars = (cents) => "$" + Math.round((Number(cents) || 0) / 100).toLocaleString("en-US");

export async function POST(req, ctx) {
  const params = await (ctx?.params || {});
  const vertical = String(params?.vertical || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "unknown";

  let form;
  try { form = await req.formData(); }
  catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }

  let snapshot;
  try { snapshot = JSON.parse(String(form.get("snapshot") || "")); } catch { snapshot = null; }
  if (!snapshot || typeof snapshot !== "object") {
    return Response.json({ ok: false, error: "missing or invalid snapshot" }, { status: 400 });
  }

  const c = (snapshot.inputs && snapshot.inputs.contact) || {};
  const name = cap(c.name);
  const email = String(c.email || "").trim();
  const phone = String(c.phone || "").trim();
  const address = String(c.address || "").trim();
  const company = String(c.company || "").trim();
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  if (!name || !address || (!emailOk && !phoneOk)) {
    return Response.json({ ok: false, error: "incomplete contact details" }, { status: 400 });
  }

  // Service label: the client's SPEC.lead.service (e.g. "POS" / "AUDIO" / "TOAST"), else the vertical.
  // createLeadProject → serviceCodeFromText turns it into the canonical 2-letter code.
  const service = String(form.get("service") || "").trim() || vertical;

  let created;
  try {
    created = createLeadProject(name, email || null, phone || null, address, service, company || null, null, {});
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "could not create the lead" }, { status: 400 });
  }
  const { accessId } = created;

  // Optional attachment (floor plan / site photo) → stored against the project. A failure never loses the lead.
  let floorplanMediaId = null;
  const file = form.get("floorplan");
  if (file && typeof file !== "string" && typeof file.arrayBuffer === "function" && OK_MIME.test(file.type || "")) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length && buf.length <= MAX_FILE) {
        const id = crypto.randomBytes(16).toString("hex");
        if (/^image\//i.test(file.type) && !/heic|heif/i.test(file.type)) {
          const img = await processImage(buf, file.name, file.type);
          insertMedia({ id, projectAccessId: accessId, kind: "site", mime: img.mime, bytes: img.bytes, w: img.w, h: img.h, createdBy: "web-lead" });
        } else {
          insertMedia({ id, projectAccessId: accessId, kind: "site", mime: file.type || "application/octet-stream", bytes: buf, w: null, h: null, createdBy: "web-lead" });
        }
        floorplanMediaId = id;
      }
    } catch (e) { console.error(`[leads/${vertical}] attachment store failed:`, e?.message || e); }
  }

  // Keep the full quote snapshot for the office (same store as cameras; the snapshot carries its own
  // calcVersion = the vertical) + a one-line summary on the project.
  try {
    const sysName = snapshot.packageName || snapshot.selectedPackage || snapshot.security?.selectedPackage || (snapshot.inputs && snapshot.inputs.level) || "";
    const summary = `${vertical.toUpperCase()} quote ${snapshot.id || ""}${sysName ? ` · ${sysName}` : ""}`
      + ` · ${dollars(snapshot.total)} (from the website).`;
    saveCctvQuoteLead({
      quoteId: snapshot.id, accessId, total: snapshot.total, snapshot,
      text: String(form.get("text") || ""), floorplanMediaId, summary,
    });
  } catch (e) { console.error(`[leads/${vertical}] save quote failed:`, e?.message || e); }

  revalidatePath("/", "layout");
  return Response.json({ ok: true, vertical, accessId, quoteId: snapshot.id || null, floorplanMediaId });
}
