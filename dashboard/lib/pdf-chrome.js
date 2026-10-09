"use client";
import { jsPDF } from "jspdf";

// Shared brand chrome for the smaller documents (Work Order, Site Survey, …): the same navy/gold
// masthead, sidebar, footer, section bars and page-aware flow the proposal PDF uses (compact masthead
// variant). Every section measures its full height and asks `ensureRoom` before drawing, so nothing is
// ever painted under the footer. `meta.__trace` / `meta.__footers` / `meta.__return` mirror the proposal
// renderer's test hooks.
export const PDF = Object.freeze({ W: 612, H: 792, HEAD_H: 80, FOOTER_H: 30.24, SAFE_GAP: 14 });
export const INK = [11, 15, 26], GOLD = [201, 169, 110], GOLD_D = [160, 120, 64], SLATE = [44, 51, 71], CREAM = [250, 248, 244], MIST = [240, 237, 232], WHITE = [255, 255, 255], MUTED = [74, 82, 112];
export const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Landscape Site Survey sheet (US letter, 792 × 612). The plan imagery is the hero, so the brand band
// is a sliver of the portrait masthead and the plan fills the page above a compact device legend. Shared
// by the standalone Site Survey PDF and the proposal's survey appendix so both render identically.
export const LAND = Object.freeze({ W: 792, H: 612, FOOTER_H: 34, MARGIN: 30, BAND_H: 46 });

// Draw ONE landscape survey floor's body (slim brand band + "SITE SURVEY" title + the auto-fit plan +
// a compact legend) on the CURRENT page. The caller adds the landscape page and paints the footer, so
// each document keeps its own traced, section-numbered footer. The plan is fit to the page (aspect
// preserved — never stretched) inside a professional margin; the legend lists each device by code and
// its canonical location name (the same names the planner shows), columns scaling with device count.
export function surveySheetBody(doc, f, { eyebrow = "SITE SURVEY", floorLabel = "", metaLines = [] } = {}) {
  const { W, H, FOOTER_H, MARGIN, BAND_H } = LAND;
  // Slim brand band — a fraction of the portrait masthead so the plan dominates.
  doc.setFillColor(...INK); doc.rect(0, 0, W, BAND_H, "F");
  doc.setFillColor(...GOLD); doc.rect(0, BAND_H, W, 2, "F");
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE);
  doc.text("IOT TECHS", MARGIN, 21);
  doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GOLD);
  doc.text("MAKE TOMORROW SAFER TODAY", MARGIN, 30, { charSpace: 1 });
  doc.setFontSize(5.5); doc.setTextColor(150, 150, 150);
  doc.text("(646) 396-0775   ·   support@iot-techs.com   ·   www.iot-techs.com", MARGIN, 39);
  // Right: the page title — SITE SURVEY eyebrow, the floor, and small context lines.
  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
  doc.text(eyebrow, W - MARGIN, 19, { align: "right", charSpace: 1.6 });
  if (floorLabel) { doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE); doc.text(String(floorLabel), W - MARGIN, 34, { align: "right" }); }
  const ml = (metaLines || []).filter(Boolean);
  if (ml.length) { doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(170, 170, 170); doc.text(ml.join("   ·   "), W - MARGIN, floorLabel ? 43 : 32, { align: "right" }); }

  // Legend geometry (pinned to the bottom); the plan takes everything between the band and the legend.
  const devs = Array.isArray(f.devices) ? f.devices : [];
  // Each entry is "code  device · room", so keep columns wider than a plain code+name list.
  const cols = devs.length > 24 ? 3 : devs.length > 10 ? 2 : 1;   // fewer, wider columns so "name · room" reads cleanly
  const lineH = 13, rows = devs.length ? Math.ceil(devs.length / cols) : 0;
  const legendH = rows ? rows * lineH + 12 : 0, colW = (W - 2 * MARGIN) / cols;
  const legendTop = H - FOOTER_H - legendH;

  // The plan is the hero, so give it a tighter inset than the brand text / legend (MARGIN) and thin gaps —
  // it fills nearly the whole sheet between the band and the legend. Aspect preserved (never stretched).
  const planM = 20, top = BAND_H + 9, pad = 4, availW = W - 2 * planM, availH = (legendTop - 5) - top;
  let d = null;
  try { const pr = doc.getImageProperties(f.img); let w = availW - 2 * pad, h = (w * pr.height) / pr.width; if (h > availH - 2 * pad) { h = availH - 2 * pad; w = (h * pr.width) / pr.height; } d = { w, h }; } catch { d = null; }
  if (d) {
    const imgX = planM + (availW - d.w) / 2, imgY = top + (availH - d.h) / 2;
    doc.setDrawColor(...GOLD_D); doc.setLineWidth(1); doc.rect(imgX - pad, imgY - pad, d.w + 2 * pad, d.h + 2 * pad, "S");
    try { doc.addImage(f.img, "PNG", imgX, imgY, d.w, d.h); } catch { /* bad image — skip, keep the page */ }
  }
  if (rows) {
    const ly = legendTop + 12;
    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.4); doc.line(MARGIN, legendTop + 3, W - MARGIN, legendTop + 3);
    doc.setFontSize(8.5);
    // Aligned cells per entry: ID (code) · Icon (the device's real glyph) · Device (name) · Room (muted).
    const idW = 20, icoS = 10, nameX0 = idW + icoS + 8;
    const nameMax = cols > 2 ? 22 : cols > 1 ? 30 : 48, roomMax = cols > 2 ? 16 : 22;
    devs.forEach((dv, i) => {
      const cx = MARGIN + (i % cols) * colW, cy = ly + Math.floor(i / cols) * lineH;
      doc.setFont("helvetica", "bold"); doc.setTextColor(...INK); doc.text(String(dv.code || ""), cx, cy);
      if (dv.icon) { try { doc.addImage(dv.icon, "PNG", cx + idW, cy - icoS + 2, icoS, icoS); } catch { /* bad glyph — skip the cell */ } }
      // device identity, then its room in a muted tone ("· Dining 1"), "Unassigned" when off every room/area.
      const name = String(dv.identity || dv.label || "").slice(0, nameMax);
      const room = (String(dv.room || "").trim() || "Unassigned").slice(0, roomMax);
      doc.setFont("helvetica", "normal"); doc.setTextColor(58, 58, 55); doc.text(name, cx + nameX0, cy);
      const nameW = doc.getTextWidth(name);
      doc.setTextColor(140, 142, 138); doc.text(" · " + room, cx + nameX0 + nameW, cy);
    });
  }
}

// docLabel: "WORK ORDER" / "SITE SURVEY"; rightLines: metadata under it; section: footer label.
// orientation "landscape" makes the whole document landscape (the Site Survey, which is all plan
// sheets) — portrait helpers (drawHeader/table/…) aren't used there, so they stay portrait-sized.
export function createBrandDoc({ docLabel, rightLines = [], section = "Document", meta = {}, orientation = "portrait" } = {}) {
  const doc = new jsPDF({ orientation, unit: "pt", format: "letter" });
  const { W, H, HEAD_H, FOOTER_H, SAFE_GAP } = PDF;
  const BOTTOM = H - FOOTER_H - SAFE_GAP, TOP = HEAD_H + 18;
  const lm = 57.6, rw = W - lm - 28.8;
  let chrome = false;
  if (meta.__trace || meta.__footers || meta.__return) {
    const rawText = doc.text.bind(doc);
    doc.text = (txt, x, y, opts) => {
      const str = Array.isArray(txt) ? txt.join("\n") : String(txt);
      if (chrome) { if (meta.__footers && /\| \d+$/.test(str)) meta.__footers.push(str); }
      else if (meta.__trace) meta.__trace.push({ page: doc.getCurrentPageInfo().pageNumber, y, text: str });
      return rawText(txt, x, y, opts);
    };
  }
  function drawHeader() {
    chrome = true;
    doc.setFillColor(...SLATE); doc.rect(0, 0, 39.6, H, "F");
    doc.setFillColor(...GOLD); doc.rect(32.4, 0, 7.2, H, "F");
    doc.setFontSize(6); doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold");
    doc.saveGraphicsState();
    doc.text("IOT TECHS  ·  LOW VOLTAGE SOLUTIONS  ·  SECURITY  ·  AUDIO", 20.2, H / 2, { angle: 90, align: "center" });
    doc.restoreGraphicsState();
    doc.setFillColor(...INK); doc.rect(39.6, 0, W - 39.6, HEAD_H, "F");
    doc.setFillColor(...GOLD); doc.rect(39.6, 0, W - 39.6, 3.24, "F");
    doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE);
    doc.text("IOT TECHS", 61.2, 36);
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GOLD);
    doc.text("MAKE TOMORROW SAFER TODAY", 61.2, 47, { charSpace: 1.2 });
    doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
    doc.text("(646) 396-0775   ·   support@iot-techs.com   ·   www.iot-techs.com", 61.2, 61);
    doc.text("Assigned Contractor: LA VAGUE INC", 61.2, 70);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    doc.text(docLabel, W - 28.8, 33, { align: "right", charSpace: 1.4 });
    doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.4);
    doc.line(W - 28.8 - Math.min(150, docLabel.length * 7), 37, W - 28.8, 37);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    rightLines.filter(Boolean).slice(0, 3).forEach((ln, i) => { doc.setTextColor(...(i === 0 ? WHITE : [170, 170, 170])); doc.text(String(ln), W - 28.8, 49 + i * 10.5, { align: "right" }); });
    chrome = false;
  }
  function drawFooter() {
    chrome = true;
    doc.setFillColor(...INK); doc.rect(39.6, H - FOOTER_H, W - 39.6, FOOTER_H, "F");
    doc.setFillColor(...GOLD); doc.rect(39.6, H - FOOTER_H, W - 39.6, 1.44, "F");
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(136, 136, 136);
    doc.text("IOT TECHS  ·  (646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com  ·  Confidential", W / 2 + 18, H - 10.08, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    doc.text(section + " | " + doc.getNumberOfPages(), W - 28.8, H - 10.08, { align: "right" });
    chrome = false;
  }
  let started = false;
  function newPage() { if (started) doc.addPage(); started = true; drawHeader(); drawFooter(); return TOP; }
  // Landscape footer for the Site Survey sheets — same ink/gold band, section-numbered, traced.
  function landFooter() {
    chrome = true;
    const { W: LW, H: LH, FOOTER_H: FH, MARGIN: LMg } = LAND;
    doc.setFillColor(...INK); doc.rect(0, LH - FH, LW, FH, "F");
    doc.setFillColor(...GOLD); doc.rect(0, LH - FH, LW, 1.44, "F");
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(136, 136, 136);
    doc.text("IOT TECHS  ·  (646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com  ·  Confidential", LW / 2, LH - 11, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    doc.text(section + " | " + doc.getNumberOfPages(), LW - LMg, LH - 11, { align: "right" });
    chrome = false;
  }
  const ensureRoom = (y, need) => (y + need > BOTTOM ? newPage() : y);
  const sectionHeader = (title, y) => {
    doc.setFillColor(...SLATE); doc.rect(lm, y, rw, 22, "F");
    doc.setFillColor(...GOLD); doc.rect(lm, y, 3, 22, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
    doc.text(title, lm + 10, y + 14.4);
    return y + 22;
  };
  // Project strip: name, address, then small "label: value" pairs on one line.
  const infoStrip = (y, { name, address, pairs = [] }) => {
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(lm, y, lm + rw, y);
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text(String(name || "Client").toUpperCase(), lm, y + 20, { charSpace: 0.6 });
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(58, 58, 55);
    doc.text(address || "Address TBD", lm, y + 34);
    const line = pairs.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("   ·   ");
    if (line) { doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(line, lm, y + 47); }
    y += line ? 58 : 46;
    doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.4); doc.line(lm, y, lm + rw, y);
    return y + 12;
  };
  // Simple table: columns [{ title, w (fraction), align }], rows [[cell…]]; header repeats on a new page.
  const table = (y, columns, rows, { zebra = true } = {}) => {
    const xs = []; let acc = lm;
    columns.forEach((c) => { xs.push(acc); acc += rw * c.w; });
    const head = (yy) => {
      doc.setFillColor(...SLATE); doc.rect(lm, yy, rw, 18, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
      columns.forEach((c, i) => doc.text(c.title, c.align === "right" ? xs[i] + rw * c.w - 6 : xs[i] + 6, yy + 12, { align: c.align || "left" }));
      return yy + 18;
    };
    y = ensureRoom(y, 18 + 17); y = head(y);
    rows.forEach((r, ri) => {
      const ny = ensureRoom(y, 17); if (ny < y) y = head(ny); else y = ny;
      doc.setFillColor(...(zebra && ri % 2 ? MIST : WHITE)); doc.rect(lm, y, rw, 17, "F");
      doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.3); doc.line(lm, y + 17, lm + rw, y + 17);
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
      r.forEach((cell, i) => { const c = columns[i]; if (c.bold) doc.setFont("helvetica", "bold"); doc.text(doc.splitTextToSize(String(cell ?? ""), rw * c.w - 12)[0] || "", c.align === "right" ? xs[i] + rw * c.w - 6 : xs[i] + 6, y + 11.5, { align: c.align || "left" }); doc.setFont("helvetica", "normal"); });
      y += 17;
    });
    return y;
  };
  // One Site Survey floor on its own LANDSCAPE sheet: slim brand band, the rasterized plan as the hero
  // (every device drawn by lib/survey2-export, auto-fit), and a compact code · location legend beneath.
  // The doc is created landscape, so the first floor uses page 1 and each later floor adds a page.
  const surveyFloor = (f, opts = {}) => {
    if (started) doc.addPage("letter", "landscape");
    started = true;
    surveySheetBody(doc, f, opts);
    landFooter();
  };
  const finish = (fileName) => { if (meta.__return) { doc.__fileName = fileName; return doc; } doc.save(fileName); return doc; };
  return { doc, W, H, lm, rw, BOTTOM, TOP, newPage, ensureRoom, sectionHeader, infoStrip, table, surveyFloor, finish };
}
