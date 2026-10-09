"use client";
// Real, cross-viewer-fillable ACCEPTANCE form for the DOWNLOADABLE proposal PDF.
//
// The jsPDF renderer (lib/proposal-pdf.js) draws the proposal and, when handed a `__acroFields`
// collector, records the Client Name / Date / Authorized Signature rects (PDF points, top-left origin)
// instead of using jsPDF's own AcroForm — which emits bare widgets with no /DA or /DR, so strict
// viewers (Adobe Acrobat, macOS Preview, iOS) can't render or keep typed text even though Chrome can.
//
// Here we post-process the rendered bytes with pdf-lib to add STANDARD AcroForm text fields with a
// complete default appearance (/DA using Helvetica), form resources (/DR), per-field appearance streams
// and NeedAppearances — so the fields fill, save and print anywhere, offline, with no website, no PDF
// JavaScript, and no flattening/rasterizing. Pricing, totals, terms and everything else stay immutable
// PDF content (they are plain drawn text, never fields). The web e-sign flow is untouched: it renders
// with meta.__signing and never passes __acroFields, so it gets no AcroForm here.
import { downloadProposalPdf } from "./proposal-pdf.js";

const INK = [0.043, 0.059, 0.102];   // matches the proposal's ink text colour

// Build the downloadable proposal as a Uint8Array with the fillable acceptance form embedded.
// Node-safe (no DOM) so it can be unit-tested; saveFillableProposalPdf() wraps it for the browser.
export async function buildFillableProposalBytes(p, meta = {}, attachments = {}) {
  const fields = [];
  const doc = downloadProposalPdf(p, { ...meta, __return: true, __acroFields: fields }, attachments);
  const fileName = doc.__fileName;
  const srcBytes = doc.output("arraybuffer");
  // A signed/accepted proposal (or one with no acceptance block) records no fields — ship it as-is.
  if (!fields.length) return { bytes: new Uint8Array(srcBytes), fileName };

  const { PDFDocument, StandardFonts, PDFName, PDFString, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(srcBytes);
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const seen = new Set();
  const ink = rgb(...INK);

  for (const f of fields) {
    const page = pages[f.page - 1];
    if (!page || seen.has(f.name)) continue;   // AcroForm field names must be unique across the document
    seen.add(f.name);
    const y = page.getHeight() - f.yTop - f.h;   // jsPDF top-left origin → pdf-lib bottom-left
    const tf = form.createTextField(f.name);
    if (f.required) tf.enableRequired();
    // Transparent chrome — the visible cream box is already drawn beneath by the renderer, so the field
    // stays subtle in viewers that don't tint form fields; still tappable where they do. addToPage sets
    // the widget + its default appearance (/DA), so the font size must be set AFTER it.
    tf.addToPage(page, { x: f.x, y, width: f.w, height: f.h, borderWidth: 0, textColor: ink });
    tf.setFontSize(f.kind === "sign" ? 13 : 10);
    tf.updateAppearances(helv);   // guarantees /DA (/Helv) + /DR so strict viewers can render typed text
  }
  // Form-level default resources (/DR) + default appearance (/DA) so a viewer regenerating a field's
  // appearance after the user types can resolve the font. The field DAs reference /Helvetica (a standard-14
  // font), so the /DR Font key must use that same name. And NeedAppearances asks every viewer to (re)build
  // value appearances on fill — the fix for "text shows only while editing / blank after reopen".
  try {
    const dr = pdf.context.obj({ Font: pdf.context.obj({ Helvetica: helv.ref }) });
    form.acroForm.dict.set(PDFName.of("DR"), dr);
    form.acroForm.dict.set(PDFName.of("DA"), PDFString.of("/Helvetica 10 Tf 0 g"));
    form.acroForm.dict.set(PDFName.of("NeedAppearances"), pdf.context.obj(true));
  } catch { /* non-fatal — per-field /DA + /AP already render in the common viewers */ }

  // Uncompressed objects (no object streams) so the AcroForm is in plain PDF objects — maximally
  // parseable by older/stricter viewers and easy to audit. The size cost is negligible for a proposal.
  const bytes = await pdf.save({ updateFieldAppearances: true, useObjectStreams: false });
  return { bytes, fileName };
}

// Browser: build the fillable PDF and trigger the download (same filename as the normal proposal PDF).
export async function saveFillableProposalPdf(p, meta = {}, attachments = {}) {
  const { bytes, fileName } = await buildFillableProposalBytes(p, meta, attachments);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName || "Proposal.pdf";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 4000);
  return fileName;
}
