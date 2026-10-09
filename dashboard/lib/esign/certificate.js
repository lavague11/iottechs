// Certificate of completion (kind "certificate"): a separate PDF that records WHO signed WHAT, WHEN and
// HOW — proposal id/version, signer name/role/email, timestamps, IP, user-agent, the sha256 of the
// unsigned and signed documents, the content fingerprint, the method used for each field and the audit
// timeline. It states facts only; it makes no legal claim beyond what was recorded.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fmtSignStamp } from "../proposal.js";

const W = 612, H = 792, M = 54;
const INK = rgb(0.06, 0.08, 0.14), META = rgb(0.38, 0.42, 0.52), GOLD = rgb(0.63, 0.47, 0.25), LINE = rgb(0.86, 0.84, 0.8);

export async function buildCertificate(c) {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const safe = (font, s) => { const set = new Set(font.getCharacterSet()); return [...String(s ?? "")].filter((ch) => set.has(ch.codePointAt(0))).join(""); };

  let page, y;
  const fresh = () => { page = pdf.addPage([W, H]); y = H - M; };
  const need = (h) => { if (y - h < M + 24) fresh(); };
  const wrap = (text, font, size, width) => {
    const out = []; let line = "";
    for (const word of safe(font, text).split(/(\s+)/)) {
      const next = line + word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line.trimEnd()); line = word.trimStart(); } else line = next;
      // hard-split a single token wider than the column (hashes, UAs)
      while (font.widthOfTextAtSize(line, size) > width) {
        let n = line.length; while (n > 1 && font.widthOfTextAtSize(line.slice(0, n), size) > width) n--;
        out.push(line.slice(0, n)); line = line.slice(n);
      }
    }
    if (line.trim()) out.push(line.trimEnd());
    return out.length ? out : [""];
  };
  const heading = (t) => { need(34); y -= 12; page.drawText(t.toUpperCase(), { x: M, y, size: 8.5, font: bold, color: GOLD }); y -= 5; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE }); y -= 13; };
  const row = (label, value, { font = reg, size = 9.5 } = {}) => {
    const lines = wrap(value, font, size, W - M * 2 - 128);
    need(lines.length * 12.5 + 3);
    page.drawText(safe(bold, label), { x: M, y, size: 8.5, font: bold, color: META });
    lines.forEach((ln, i) => page.drawText(ln, { x: M + 128, y: y - i * 12.5, size, font, color: INK }));
    y -= lines.length * 12.5 + 3;
  };

  fresh();
  page.drawText("IOT TECHS", { x: M, y: y - 4, size: 11, font: bold, color: GOLD });
  page.drawText("Certificate of Completion", { x: M, y: y - 30, size: 20, font: bold, color: INK });
  y -= 52;
  page.drawText(safe(reg, `Issued ${fmtSignStamp(c.signedAt)} · Reference ${c.reference}`), { x: M, y, size: 9, font: reg, color: META });
  y -= 6;

  heading("Document");
  row("Proposal", `${c.reference} · version ${c.version} · Option ${c.optionKey}`);
  row("Project", c.projectId);
  row("File", c.fileName || "—");
  row("Content fingerprint", c.fingerprint, { font: mono, size: 9 });
  row("Unsigned SHA-256", c.unsignedSha256, { font: mono, size: 8.5 });
  row("Signed SHA-256", c.signedSha256, { font: mono, size: 8.5 });

  heading("Signer");
  row("Name", c.signer.name);
  row("Role", c.signer.role);
  row("Email", c.signer.email || "—");
  row("Authenticated by", c.signer.via);
  row("Signed", fmtSignStamp(c.signedAt));
  row("IP address", c.ip || "—");
  row("Device", c.ua || "—", { size: 8.5 });

  heading("Fields");
  for (const f of c.fields) row(f.label, f.method);
  for (const a of c.acks) row(a.label, a.agreed ? "Agreed" : "Not checked");

  heading("Timeline");
  for (const e of c.events) row(fmtSignStamp(e.at), `${e.label}${e.ip ? ` · ${e.ip}` : ""}`, { size: 9 });

  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Certificate ${c.reference} · page ${i + 1} of ${pages.length}`, { x: M, y: 28, size: 7.5, font: reg, color: META }));
  pdf.setTitle(`Certificate of Completion — ${c.reference}`);
  pdf.setProducer("IOT TECHS e-sign");
  return Buffer.from(await pdf.save());
}
