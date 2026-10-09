// Server-side flatten: stamp the signer's name, date and signature PNG onto the STORED unsigned PDF and
// return the bytes of a NEW signed PDF. The unsigned original is never modified. Field positions are the
// generator's page fractions (top-left origin); pdf-lib draws from the bottom-left, so y is converted here.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { parsePngDataUrl } from "./capture.js";
import { fmtSignStamp } from "../proposal.js";

const INK = rgb(16 / 255, 32 / 255, 74 / 255);
const GREEN = rgb(29 / 255, 122 / 255, 58 / 255);
const SIG_MAX_W = 140;   // pt — same footprint the legacy signed PDF gave a drawn signature

// Helvetica only encodes WinAnsi: drop anything it can't (a name with CJK must not crash the signing).
function safe(font, s) {
  const set = new Set(font.getCharacterSet());
  return [...String(s)].filter((ch) => set.has(ch.codePointAt(0))).join("");
}

// unsignedBytes: Buffer | Uint8Array. fields: [{ key, type, page, x, y, w, h }]. values: { name, signature:{data} }.
// signedAt: the proposal's own signed_at ("YYYY-MM-DD HH:MM:SS", Eastern) so PDF and record agree.
export async function flattenSigned({ unsignedBytes, fields, values, signedAt, title = "Signed proposal", meta = {} }) {
  const png = parsePngDataUrl(values?.signature?.data);
  if (!png.ok) throw new Error(png.error);
  if (!values?.name) throw new Error("A name is required.");
  const pdf = await PDFDocument.load(unsignedBytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const img = await pdf.embedPng(png.bytes);
  const pages = pdf.getPages();
  const dateText = fmtSignStamp(signedAt);

  for (const f of fields) {
    const page = pages[f.page - 1];
    if (!page) throw new Error(`Field ${f.key} is on a page that doesn't exist.`);
    const { width: W, height: H } = page.getSize();
    const left = f.x * W, w = f.w * W, h = f.h * H;
    const bottom = H - (f.y + f.h) * H;              // top-left fraction → bottom-left point
    if (f.type === "name" || f.type === "date") {
      const text = safe(font, f.type === "name" ? values.name : dateText);
      let size = 9.5;
      while (size > 6 && font.widthOfTextAtSize(text, size) > w - 6) size -= 0.5;
      page.drawText(text, { x: left + 3, y: bottom + (h - size) / 2 + 1.5, size, font, color: INK });
    } else if (f.type === "signature") {
      const maxW = Math.min(w - 6, SIG_MAX_W), maxH = h - 2;
      const k = Math.min(maxW / img.width, maxH / img.height);
      const dw = img.width * k, dh = img.height * k;
      page.drawImage(img, { x: left + 3, y: bottom + (h - dh) / 2, width: dw, height: dh });
      // The ACCEPTED stamp the legacy signed PDF carried, in the clear middle of the box.
      const stampX = left + 3 + Math.max(dw, SIG_MAX_W) + 14;
      if (stampX + 50 < left + w) page.drawText("ACCEPTED", { x: stampX, y: bottom + (h - 11) / 2 + 2, size: 11, font, color: GREEN });
    }
  }
  pdf.setTitle(title);
  pdf.setProducer("IOT TECHS e-sign");
  pdf.setSubject(`Signed by ${safe(font, values.name)} · ${dateText}`);
  if (meta.keywords) pdf.setKeywords(meta.keywords);
  pdf.setModificationDate(new Date());
  return Buffer.from(await pdf.save());
}
