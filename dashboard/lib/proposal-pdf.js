"use client";
import { jsPDF, AcroFormTextField } from "jspdf";
import { optionTotals, itemTotal, svcSubtotal, titleCase, fmtSignStamp, PAYMENT_PLANS, displayOptionName } from "./proposal.js";
import { scopeMismatches } from "./survey2-model.js";

// Ported from the legacy calculator's own PDF export (IOTTechs_ProposalCalculator.html
// generatePDF) so the downloaded document matches the owner's established brand proposal —
// same layout, colors, and section styling, adapted to read from the new multi-option /
// per-service proposal data model instead of the legacy flat LABOR/EQUIPMENT sections.
const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// attachments (optional): { mockupPhotos: [dataURL...], surveyImages: [{name, img:dataURL}...] }.
// Both are appended after the priced options — the mockup photos and the pinned site-survey floor
// plans — so the customer's downloaded proposal carries the visual context, not just the numbers.
// ---- Executive summary helpers (detailed mode) --------------------------------------------------
// Headline counts per service from the actual items: packages (a camera location, a speaker install)
// plus named head-end gear. Every value comes from the proposal; nothing is assumed.
const qtyOf = (it) => Math.max(1, +it.qty || 1);
const hasSub = (it) => (it.sub || []).length > 0;
const plural = (n, one, many) => (n === 1 ? one : many);
export function serviceMetrics(svc) {
  const items = (svc.items || []).filter((it) => !it.waived);
  const pk = items.filter(hasSub).reduce((n, it) => n + qtyOf(it), 0);
  const count = (re) => items.filter((it) => !hasSub(it) && re.test(it.name || "")).reduce((n, it) => n + qtyOf(it), 0);
  const tb = items.reduce((n, it) => { const m = /(\d+)\s*TB/i.exec(it.name || ""); return n + (m ? +m[1] * qtyOf(it) : 0); }, 0);
  const zones = items.reduce((n, it) => { const m = /(\d+)-zone/i.exec(it.name || ""); return n + (m ? +m[1] * qtyOf(it) : 0); }, 0);
  const out = [];
  const add = (n, one, many) => { if (n > 0) out.push({ n, label: plural(+n, one, many) }); };
  switch (svc.key) {
    case "camera": {
      add(pk + count(/^(4k )?(bullet|dome|turret)? ?camera$/i), "CAMERA", "CAMERAS");
      add(count(/^NVR/i), "NVR", "NVRS");
      if (tb) out.push({ n: `${tb}TB`, label: "STORAGE" });
      add(count(/monitor|display|customer provided/i), "MONITOR", "MONITORS");
      add(count(/poe switch/i), "POE SWITCH", "POE SWITCHES");
      break;
    }
    case "sound": {
      add(pk + count(/speaker$/i), "SPEAKER", "SPEAKERS");
      add(count(/amplifier|\bamp\b/i), "AMPLIFIER", "AMPLIFIERS");
      if (zones) out.push({ n: zones, label: "ZONES" });
      add(count(/volume control/i), "VOLUME CONTROL", "VOLUME CONTROLS");
      break;
    }
    case "access": {
      add(pk + count(/strike|maglock|door controller/i), "DOOR", "DOORS");
      add(count(/reader/i), "READER", "READERS");
      add(count(/controller/i), "CONTROLLER", "CONTROLLERS");
      break;
    }
    case "toast": {
      add(pk, "DEVICE", "DEVICES");
      add(count(/access point/i), "ACCESS POINT", "ACCESS POINTS");
      add(count(/pos terminal|kiosk/i), "TERMINAL", "TERMINALS");
      add(count(/printer/i), "PRINTER", "PRINTERS");
      break;
    }
    case "alarm": {
      add(pk + count(/sensor|motion|glass/i), "SENSOR", "SENSORS");
      add(count(/keypad/i), "KEYPAD", "KEYPADS");
      add(count(/panel/i), "PANEL", "PANELS");
      break;
    }
    case "wiring": {
      add(pk + count(/drop/i), "CABLE RUN", "CABLE RUNS");
      add(count(/patch panel|rack/i), "RACK ITEM", "RACK ITEMS");
      break;
    }
    default: {
      add(pk, "PACKAGE", "PACKAGES");
      add(items.filter((it) => !hasSub(it)).reduce((n, it) => n + qtyOf(it), 0), "ITEM", "ITEMS");
    }
  }
  return out.slice(0, 5);
}
// Installation scope: one line per package kind ("5  Camera installations") then the aggregated
// components across packages in customer language. A component named like its package is implied.
const SCOPE_LABELS = {
  "cat6 drop": "Cat6 cable runs", "cat6 termination": "Terminations", "camera mounting": "Camera mounts",
  "camera programming": "Programming / commissioning", "camera waterproofing": "Weatherproofing",
  "speaker wire run": "Speaker wire runs", "drill mount tune": "Mount / tune", "line drop": "Cable drops",
  "line drop — existing": "Existing cable checks", "device mounting": "Device mounts", "keystone": "Keystone jacks",
};
export function scopeLines(svc) {
  const packages = new Map(), parts = new Map();
  (svc.items || []).forEach((it) => {
    if (!hasSub(it) || it.waived) return;
    const q = qtyOf(it);
    const kind = svc.key === "camera" ? "Camera installations" : `${titleCase(it.name)} installations`;
    packages.set(kind, (packages.get(kind) || 0) + q);
    it.sub.forEach((x) => {
      const n = String(x.name || "").trim(); if (!n) return;
      const lc = n.toLowerCase();
      if (lc === String(it.name || "").trim().toLowerCase() || (svc.key === "camera" && lc === "camera")) return;
      const lbl = SCOPE_LABELS[lc] || (titleCase(n) + (/s$/i.test(n) ? "" : "s"));
      parts.set(lbl, (parts.get(lbl) || 0) + (+x.qty || 1) * q);
    });
  });
  return [...packages.entries(), ...parts.entries()].map(([txt, q]) => [q, txt]);
}

export function downloadProposalPdf(p, meta = {}, attachments = {}) {
  // A SIGNED proposal downloads as the EXACT signed artifact — render from the frozen snapshot the
  // signature is bound to (and the signed date below), never a live re-render of the current payload.
  if (p && p.signed_at && p.signedPayload) p = { ...p, payload: p.signedPayload };
  const { customerName, customerAddress, customerPhone, customerEmail } = meta;
  // One document model, two renderings of the SAME proposal version: "standard" (the concise customer
  // proposal) and "detailed" (system summary + every package expanded into its components). Same
  // items, totals, payment terms and acceptance — only the level of detail differs.
  const mode = meta.mode === "detailed" ? "detailed" : "standard";
  const detailed = mode === "detailed";
  if (meta.__trace) meta.__docLabel = detailed ? "DETAILED PROPOSAL" : "SYSTEM PROPOSAL";   // header chrome is not traced
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const W = 612, H = 792;
  // Page geometry. The footer band is FOOTER_H tall and painted last on every page; BOTTOM is the
  // lowest point content may reach (footer + a safe gap). Every section measures its own height and
  // asks for room BEFORE drawing — nothing is ever painted under the footer or clipped.
  // Detailed mode opens with a compact masthead (~35% shorter) so the reader reaches the system sooner.
  const HEAD_H = detailed ? 80 : 122.4;
  const FOOTER_H = 30.24, SAFE_GAP = 14, BOTTOM = H - FOOTER_H - SAFE_GAP, TOP = HEAD_H + 18;
  // Test/regression hook: meta.__trace collects every content text call as { page, y, text } (footer
  // and header chrome excluded via `chrome`); meta.__footers collects the footer page labels;
  // meta.__return returns the jsPDF document instead of saving a file.
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
  const INK = [11, 15, 26];
  const GOLD = [201, 169, 110];
  const GOLD_D = [160, 120, 64];
  const SLATE = [44, 51, 71];
  const CREAM = [250, 248, 244];
  const MIST = [240, 237, 232];
  const WHITE = [255, 255, 255];
  const lm = 57.6;
  const rw = W - lm - 28.8;

  // Footer page label: which section this page belongs to + the running page number
  // (e.g. "Proposal | 1", "Mockup | 2", "Survey | 3"). Set before creating each page.
  let currentSection = "Proposal";

  // Payment schedule due dates — off the signed date (once signed) else the issue date, standard
  // offsets: deposit on signing, progress ~2 weeks, final Net-30. Matches the on-screen customer view.
  const payBaseRaw = p.signed_at || p.sent_at || p.created_at || null;
  const payBaseDate = payBaseRaw ? new Date(String(payBaseRaw).replace(" ", "T")) : new Date();
  const dueOn = (days) => { const d = new Date(payBaseDate); d.setDate(d.getDate() + (+days || 0)); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

  const propNum = "PROP-" + String(p.id || "0").padStart(4, "0") + "-v" + (p.version || 1);
  // Date the SIGNED date once signed (a fixed artifact), else today's issue date.
  const propDate = (p.signed_at ? new Date(String(p.signed_at).replace(" ", "T")) : new Date())
    .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function drawHeader() {
    chrome = true;
    doc.setFillColor(...SLATE);
    doc.rect(0, 0, 39.6, H, "F");
    doc.setFillColor(...GOLD);
    doc.rect(32.4, 0, 7.2, H, "F");
    doc.setFontSize(6);
    doc.setTextColor(...GOLD);
    doc.setFont("helvetica", "bold");
    doc.saveGraphicsState();
    doc.text("IOT TECHS  ·  LOW VOLTAGE SOLUTIONS  ·  SECURITY  ·  AUDIO", 20.2, H / 2, { angle: 90, align: "center" });
    doc.restoreGraphicsState();

    doc.setFillColor(...INK);
    doc.rect(39.6, 0, W - 39.6, HEAD_H, "F");
    doc.setFillColor(...GOLD);
    doc.rect(39.6, 0, W - 39.6, 3.24, "F");

    if (detailed) {
      // Compact editorial masthead: the brand dominates; the document type is metadata, not a headline.
      doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE);
      doc.text("IOT TECHS", 61.2, 36);
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GOLD);
      doc.text("MAKE TOMORROW SAFER TODAY", 61.2, 47, { charSpace: 1.2 });
      doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
      doc.text("(646) 396-0775   ·   support@iot-techs.com   ·   www.iot-techs.com", 61.2, 61);
      doc.text("Assigned Contractor: LA VAGUE INC", 61.2, 70);
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
      doc.text("DETAILED PROPOSAL", W - 28.8, 33, { align: "right", charSpace: 1.4 });
      doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.4);
      doc.line(W - 28.8 - 96, 37, W - 28.8, 37);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...WHITE);
      doc.text(propNum, W - 28.8, 49, { align: "right" });
      doc.setTextColor(170, 170, 170);
      doc.text(propDate, W - 28.8, 59.5, { align: "right" });
      doc.setFontSize(6.5); doc.setTextColor(...GOLD);
      doc.text("SECURITY & LOW VOLTAGE", W - 28.8, 70, { align: "right", charSpace: 1 });
      chrome = false;
      return;
    }

    doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE);
    doc.text("IOT TECHS", 61.2, 46.8);

    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GOLD);
    doc.text("MAKE TOMORROW SAFER TODAY", 61.2, 60.48);
    doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.5);
    doc.line(61.2, 66.24, 216, 66.24);

    doc.setFontSize(7.5); doc.setTextColor(170, 170, 170);
    doc.text("(646) 396-0775   ·   support@iot-techs.com   ·   www.iot-techs.com", 61.2, 79.2);
    doc.text("Assigned Contractor: LA VAGUE INC", 61.2, 90.72);

    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    const docLabel = detailed ? "DETAILED PROPOSAL" : "SYSTEM PROPOSAL";
    doc.text(docLabel, W - 28.8, 37.44, { align: "right" });
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
    doc.line(W - 28.8 - doc.getTextWidth(docLabel), 41.04, W - 28.8, 41.04);

    doc.setFillColor(...GOLD);
    doc.roundedRect(W - 180, 50.76, 151.2, 17.28, 2.88, 2.88, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("SECURITY & LOW VOLTAGE", W - 104.4, 62.28, { align: "center" });

    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(170, 170, 170);
    doc.text(propDate, W - 28.8, 77.76, { align: "right" });
    doc.text("Proposal #: " + propNum, W - 28.8, 88.56, { align: "right" });
    chrome = false;
  }

  function drawFooter() {
    chrome = true;
    doc.setFillColor(...INK);
    doc.rect(39.6, H - FOOTER_H, W - 39.6, FOOTER_H, "F");
    doc.setFillColor(...GOLD);
    doc.rect(39.6, H - FOOTER_H, W - 39.6, 1.44, "F");
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(136, 136, 136);
    doc.text("IOT TECHS  ·  (646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com  ·  Confidential Proposal", W / 2 + 18, H - 10.08, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    doc.text(currentSection + " | " + doc.getNumberOfPages(), W - 28.8, H - 10.08, { align: "right" });
    chrome = false;
  }

  function newPage() {
    doc.addPage();
    drawHeader();
    drawFooter();
    return TOP;
  }
  // Room check: `need` is the COMPLETE height of what is about to be drawn. Returns the y to draw at —
  // unchanged when it fits above BOTTOM, else the top of a fresh page (so a block never straddles).
  const ensureRoom = (y, need) => (y + need > BOTTOM ? newPage() : y);
  const movedToNewPage = (before, after) => after < before;

  const sectionHeader = (title, yPos) => {
    doc.setFillColor(...SLATE);
    doc.rect(lm, yPos, rw, 22, "F");
    doc.setFillColor(...GOLD);
    doc.rect(lm, yPos, 3, 22, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
    doc.text(title, lm + 10, yPos + 14.4);
    return yPos + 22;
  };

  let rowIdx = 0;
  const tableHeader = (yPos) => {
    doc.setFillColor(...SLATE);
    doc.rect(lm, yPos, rw, 20, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(1);
    doc.line(lm, yPos + 20, lm + rw, yPos + 20);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
    doc.text("#", lm + 12, yPos + 13, { align: "center" });
    doc.text("Description", lm + 22, yPos + 13);
    doc.text("Qty", lm + rw * 0.72, yPos + 13, { align: "center" });
    doc.text("Unit", lm + rw * 0.86, yPos + 13, { align: "right" });
    doc.text("Total", lm + rw - 6, yPos + 13, { align: "right" });
    return yPos + 20;
  };

  // `strike`: waived line — the Unit & Total prices print red with a line through them (mirrors the
  // on-screen waived treatment). A single "$300.00" fits its column, so nothing overlaps the Unit
  // cell the way the old "$0.00 (waived $300.00)" string did.
  const RED = [192, 57, 43];
  // A row is as tall as its wrapped description (one line = 18pt; each extra line adds 10pt), so a
  // long name pushes what follows down instead of overprinting the next row or the footer.
  const DESC_W = rw * 0.66, ROW_H = 18, LINE_H = 10;
  const descLines = (desc) => { doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); return doc.splitTextToSize(String(desc), DESC_W); };
  const rowHeight = (desc) => ROW_H + (descLines(desc).length - 1) * LINE_H;
  const tableRow = (num, desc, qty, unit, total, yPos, strike = false) => {
    const lines = descLines(desc);
    const h = ROW_H + (lines.length - 1) * LINE_H;
    const bg = rowIdx % 2 === 0 ? WHITE : MIST;
    doc.setFillColor(...bg);
    doc.rect(lm, yPos, rw, h, "F");
    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.3);
    doc.line(lm, yPos + h, lm + rw, yPos + h);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
    doc.text(num, lm + 12, yPos + 12, { align: "center" });
    lines.forEach((ln, i) => doc.text(ln, lm + 22, yPos + 12 + i * LINE_H));
    doc.text(qty, lm + rw * 0.72, yPos + 12, { align: "center" });
    const price = (txt, x) => {
      doc.setTextColor(...(strike ? RED : INK));
      doc.text(txt, x, yPos + 12, { align: "right" });
      if (strike) {   // strike-through line across the price
        const w = doc.getTextWidth(txt);
        doc.setDrawColor(...RED); doc.setLineWidth(0.8);
        doc.line(x - w, yPos + 9, x, yPos + 9);
      }
    };
    price(unit, lm + rw * 0.86);
    price(total, lm + rw - 6);
    doc.setTextColor(...INK);
    rowIdx++;
    return yPos + h;
  };

  // Detailed mode: a package's components, indented under their parent. They EXPLAIN the parent
  // total (itemTotal already sums them) and are never added to any subtotal again. A $0 component
  // reads "Included".
  const CHILD_H = 15;
  const childRow = (desc, qty, unit, amount, yPos) => {
    doc.setFillColor(...WHITE);
    doc.rect(lm, yPos, rw, CHILD_H, "F");
    doc.setDrawColor(236, 232, 224); doc.setLineWidth(0.3);
    doc.line(lm + 22, yPos + CHILD_H, lm + rw, yPos + CHILD_H);
    doc.setFontSize(7.8); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
    doc.text("·", lm + 26, yPos + 10.5);
    doc.text(doc.splitTextToSize(String(desc), DESC_W - 20)[0], lm + 34, yPos + 10.5);
    doc.text(String(qty), lm + rw * 0.72, yPos + 10.5, { align: "center" });
    const inc = !(+amount > 0);
    doc.text(inc ? "" : "$" + money(unit), lm + rw * 0.86, yPos + 10.5, { align: "right" });
    doc.text(inc ? "Included" : "$" + money(amount), lm + rw - 6, yPos + 10.5, { align: "right" });
    doc.setTextColor(...INK);
    return yPos + CHILD_H;
  };

  const subtotalRow = (label, amount, yPos) => {
    doc.setFillColor(238, 241, 248);
    doc.rect(lm, yPos, rw, 18, "F");
    doc.setDrawColor(...SLATE); doc.setLineWidth(1);
    doc.line(lm, yPos, lm + rw, yPos);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...SLATE);
    doc.text(label, lm + rw - 84, yPos + 12, { align: "right" });
    doc.text(amount, lm + rw - 6, yPos + 12, { align: "right" });
    return yPos + 18;
  };

  const grandTotalBanner = (label, amount, yPos) => {
    doc.setFillColor(...INK);
    doc.rect(lm, yPos, rw, 28.8, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
    doc.line(lm, yPos, lm + rw, yPos);
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
    doc.text(label, lm + rw - 90, yPos + 18, { align: "right" });
    doc.setFontSize(12); doc.setTextColor(...GOLD);
    doc.text(amount, lm + rw - 6, yPos + 19, { align: "right" });
    return yPos + 28.8;
  };

  // Only render options that actually have line items — an empty B/C never makes a blank page.
  // (Fall back to all options if somehow none have items, so the proposal is never empty.)
  const optionsWithData = p.payload.options.filter((o) => (o.services || []).some((s) => (s.items || []).length));
  const renderOptions = optionsWithData.length ? optionsWithData : p.payload.options;

  renderOptions.forEach((opt, oi) => {
    if (oi > 0) doc.addPage();
    drawHeader();
    drawFooter();
    let y = TOP;

    if (p.payload.options.length > 1) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...SLATE);
      doc.text(`Option ${opt.id} — ${displayOptionName(opt.name)}`, lm, y);
      y += 14.4;
    }

    if (detailed) {
      // One project-information strip: who, where, how to reach them. No repeated labels, no cells —
      // the proposal number and date already sit in the masthead.
      doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(lm, y, lm + rw, y);
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(String(customerName || "Client TBD").toUpperCase(), lm, y + 20, { charSpace: 0.6 });
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(58, 58, 55);
      doc.text(customerAddress || "Address TBD", lm, y + 34);
      const contact = [customerPhone, customerEmail].filter(Boolean).join("   ·   ");
      if (contact) { doc.setFontSize(8); doc.setTextColor(74, 82, 112); doc.text(contact, lm, y + 47); }
      y += contact ? 58 : 46;
      doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.4); doc.line(lm, y, lm + rw, y);
      y += 12;
    }
    // Client info box (standard)
    const infoH = 64.8;
    if (!detailed) {
    doc.setFillColor(...WHITE);
    doc.rect(lm, y, rw, infoH, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(2);
    doc.line(lm, y, lm + rw, y);
    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.5);
    doc.rect(lm, y, rw, infoH, "S");

    const cols = [lm + 6, lm + rw * 0.40, lm + rw * 0.74];
    const infoItems = [
      ["PREPARED FOR", customerName || "Client TBD"],
      ["PROJECT ADDRESS", (customerAddress || "Address TBD").slice(0, 32)],
      ["PROPOSAL #", propNum],
    ];
    const infoItems2 = [
      ["CLIENT NAME", customerName || "Client TBD"],
      ["PHONE", customerPhone || "—"],
      ["EMAIL", (customerEmail || "—").slice(0, 28)],
    ];
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
    infoItems.forEach((item, i) => doc.text(item[0], cols[i], y + 12));
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    infoItems.forEach((item, i) => doc.text(item[1], cols[i], y + 26));

    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.4);
    doc.line(lm, y + 32.4, lm + rw, y + 32.4);

    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
    infoItems2.forEach((item, i) => doc.text(item[0], cols[i], y + 45));
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    infoItems2.forEach((item, i) => doc.text(item[1], cols[i], y + 57.6));

    y += infoH + 7.2;
    doc.setDrawColor(...GOLD); doc.setLineWidth(1);
    doc.line(lm, y, lm + rw, y);
    y += 7.2;
    }

    const t = optionTotals(opt, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);

    // Detailed: EXECUTIVE SYSTEM SUMMARY — one coherent region: small gold label, per-service heading,
    // headline metrics, installation scope, and a compact project summary on the right. Derived from
    // the structured items only; no navy bars until the technical breakdown below.
    if (detailed) {
      const MUTED = [74, 82, 112];
      const label = (txt, x, yy) => { doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD_D); doc.text(txt, x, yy, { charSpace: 1.3 }); };
      const groups = (opt.services || []).filter((svc) => svc.items?.length).map((svc) => ({ label: svc.label, metrics: serviceMetrics(svc), scope: scopeLines(svc) }));
      const finRows = [["Project subtotal", "$" + money(t.sub)]];
      if (t.discount > 0) finRows.push(["Discount", "-$" + money(t.discount)]);
      if (t.pcpCredit > 0) finRows.push(["PCP credit", "-$" + money(t.pcpCredit)]);
      if (t.tax > 0) finRows.push([`Sales tax (${p.tax_rate}%)`, "+$" + money(t.tax)]);
      const finH = 12 + finRows.length * 13 + 8 + 18;
      const groupH = (g) => 16 + (g.metrics.length ? 34 : 0) + (g.scope.length ? 14 + g.scope.length * 12 : 0) + 10;
      y = ensureRoom(y, 14 + groupH(groups[0] || { metrics: [], scope: [] }));
      label("SYSTEM SUMMARY", lm, y + 6);
      doc.setDrawColor(...GOLD); doc.setLineWidth(0.5); doc.line(lm + 78, y + 4, lm + rw, y + 4);
      y += 18;
      const finX = lm + rw * 0.62, finW = rw * 0.38;
      groups.forEach((g, gi) => {
        y = ensureRoom(y, groupH(g) + (gi === groups.length - 1 ? Math.max(0, finH - (g.scope.length * 12)) : 0));
        doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
        doc.text(g.label.toUpperCase(), lm, y + 10, { charSpace: 0.8 });
        y += 16;
        if (g.metrics.length) {
          let mx = lm;
          g.metrics.forEach((m) => {
            doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
            doc.text(String(m.n), mx, y + 15);
            const nw = doc.getTextWidth(String(m.n));
            doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...MUTED);
            doc.text(m.label, mx, y + 25, { charSpace: 1 });
            mx += Math.max(nw, doc.getTextWidth(m.label) * 1.25) + 26;
          });
          y += 34;
        }
        const scopeTop = y;
        if (g.scope.length) {
          label("INSTALLATION SCOPE", lm, y + 6);
          y += 14;
          g.scope.forEach(([qty, txt]) => {
            doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
            doc.text(String(qty), lm + 16, y + 8, { align: "right" });
            doc.setFont("helvetica", "normal"); doc.setTextColor(58, 58, 55);
            doc.text(txt, lm + 26, y + 8);
            y += 12;
          });
        }
        if (gi === groups.length - 1) {
          // Project summary — aligned block on the right of the last service's scope; FINAL dominant.
          let fy = scopeTop;
          label("PROJECT SUMMARY", finX, fy + 6); fy += 14;
          finRows.forEach(([l, a]) => {
            doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
            doc.text(l, finX, fy + 8); doc.text(a, finX + finW, fy + 8, { align: "right" }); fy += 13;
          });
          doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(finX, fy + 2, finX + finW, fy + 2); fy += 8;
          doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
          doc.text("FINAL", finX, fy + 10, { charSpace: 1 });
          doc.setFontSize(12.5); doc.setTextColor(...GOLD_D);
          doc.text("$" + money(t.grand), finX + finW, fy + 10, { align: "right" });
          fy += 18;
          y = Math.max(y, fy);
        }
        y += 10;
      });
      doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.4); doc.line(lm, y, lm + rw, y);
      y += 12;
    }

    // Project cost breakdown — one section per service, one row per line item
    // (a camera/Toast block collapses to its own all-in total, same as the on-screen view;
    // the detailed rendering lists each package's components underneath it)
    y = sectionHeader(detailed ? "DETAILED SYSTEM BREAKDOWN" : "PROJECT COST BREAKDOWN", y) + 4;
    y = tableHeader(y);
    rowIdx = 0;
    let lineNum = 1;

    (opt.services || []).forEach((svc) => {
      if (!svc.items?.length) return;
      // Service band + its first row travel together (a heading is never orphaned above the footer).
      const first = svc.items[0];
      { const ny = ensureRoom(y, 16 + rowHeight(titleCase(first.name) + (first.waived ? "  — Waived" : "")) + 4);
        if (movedToNewPage(y, ny)) { y = tableHeader(ny); rowIdx = 0; } else y = ny; }
      doc.setFillColor(...INK);
      doc.rect(lm, y, rw, 16, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
      doc.text(svc.label.toUpperCase(), lm + 10, y + 11);
      y += 16;

      let secTotal = 0;
      svc.items.forEach((it) => {
        // Hard page break every 12 line items (owner rule) — re-draw the column header on the new page.
        const desc = titleCase(it.name) + (it.waived ? "  — Waived" : "");
        const hasSub = (it.sub || []).length > 0;
        const showKids = detailed && hasSub && !it.waived;
        if (lineNum > 1 && (lineNum - 1) % 12 === 0 && !detailed) { y = newPage(); y = tableHeader(y); rowIdx = 0; }
        else { const ny = ensureRoom(y, rowHeight(desc) + (showKids ? CHILD_H : 0) + 4); if (movedToNewPage(y, ny)) { y = tableHeader(ny); rowIdx = 0; } else y = ny; }
        const tot = itemTotal(it);
        const gross = it.waived ? itemTotal({ ...it, waived: false }) : tot;
        secTotal += tot;
        y = tableRow(
          String(lineNum), detailed && it.waived ? titleCase(it.name) : desc,
          hasSub ? "1" : String(it.qty ?? 1),
          detailed && it.waived ? "—" : "$" + money(hasSub ? gross : it.price),
          detailed && it.waived ? "Waived" : "$" + money(it.waived ? gross : tot), y, !!it.waived && !detailed
        );
        if (showKids) {
          // Components explain the package total; a parent with its own price on top is flagged
          // (internally) as not fully explained — pricing is never altered here.
          const kidsSum = it.sub.reduce((s2, x) => s2 + (+x.qty || 1) * (+x.price || 0), 0);
          if (meta.__warnings && Math.abs(kidsSum - tot) > 0.005) meta.__warnings.push(`${propNum} ${desc}: component breakdown ($${money(kidsSum)}) differs from package total ($${money(tot)})`);
          it.sub.forEach((x) => {
            { const ny = ensureRoom(y, CHILD_H + 2); if (movedToNewPage(y, ny)) { y = tableHeader(ny); rowIdx = 0; } else y = ny; }
            y = childRow(titleCase(x.name), x.qty ?? 1, x.price, (+x.qty || 1) * (+x.price || 0), y);
          });
          y += 2;
        }
        lineNum++;
      });
      y = ensureRoom(y, 22);
      y = subtotalRow(svc.label + " Subtotal", "$" + money(secTotal), y);
      y += 4;
    });

    y = ensureRoom(y, 40);
    y += 4;
    y = subtotalRow("PROJECT SUBTOTAL", "$" + money(t.sub), y);
    y += 4;
    if (t.discount > 0) {
      y = ensureRoom(y, 20);
      y = tableRow("", "Discount", "", "", "-$" + money(t.discount), y);
      y += 4;
    }
    if (t.pcpCredit > 0) {
      y = ensureRoom(y, 20);
      y = tableRow("", "PCP Credit", "", "", "-$" + money(t.pcpCredit), y);
      y += 4;
    }
    if (t.tax > 0) {
      y = ensureRoom(y, 20);
      y = tableRow("", `Sales Tax (${p.tax_rate}%)`, "", "", "+$" + money(t.tax), y);
      y += 4;
    }
    y = ensureRoom(y, 30);
    y = grandTotalBanner("GRAND TOTAL", "$" + money(t.grand), y);
    y += 14;

    // Camera locations — bulleted, from each individually-placed camera block
    const camSvc = (opt.services || []).find((s) => s.key === "camera");
    const camBlocks = (camSvc?.items || []).filter((it) => (it.sub || []).length > 0);
    if (camBlocks.length) {
      y = ensureRoom(y, 28 + Math.ceil(camBlocks.length / 2) * 15 + 18);
      y = sectionHeader("CAMERA LOCATIONS", y) + 6;
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
      const colW = rw / 2;
      let col = 0, rowY = y;
      camBlocks.forEach((it) => {
        const label = "• " + titleCase(it.name).replace(/\s*—.*$/, "");
        doc.text(label, lm + 6 + col * colW, rowY + 10);
        col++;
        if (col === 2) { col = 0; rowY += 15; }
      });
      if (col === 1) rowY += 15;
      y = rowY + 4;
      doc.setFont("helvetica", "bold"); doc.setTextColor(...SLATE);
      doc.text(`Total Camera Locations: ${camBlocks.length}`, lm + 6, y + 8);
      y += 14;
    }

    // Payment terms — ONE block (heading, schedule, methods, plan terms, tax note). Its full height is
    // measured first; if it would run into the footer the whole block moves to the next page.
    const depositPct = +p.deposit_pct || 50;
    const finalPct = 100 - depositPct;
    const payPlan = p.payload.payment_plan || "custom";
    const payments = payPlan === "50_30_20"
      ? [
          ["Deposit", dueOn(0), "50%", "$" + money(t.grand * 0.5)],
          ["Progress", dueOn(14), "30%", "$" + money(t.grand * 0.3)],
          ["Final", dueOn(30), "20%", "$" + money(t.grand * 0.2)],
        ]
      : payPlan === "50_50"
      ? [
          ["Deposit", dueOn(0), "50%", "$" + money(t.grand * 0.5)],
          ["Final", dueOn(30), "50%", "$" + money(t.grand * 0.5)],
        ]
      : [
          ["Deposit", dueOn(0), depositPct + "%", "$" + money(t.grand * depositPct / 100)],
          ["Final", dueOn(30), finalPct + "%", "$" + money(t.grand * finalPct / 100)],
        ];
    const planTerms = PAYMENT_PLANS[payPlan]?.terms;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const termLines = planTerms ? doc.splitTextToSize(planTerms, rw) : [];
    const termsH = termLines.length ? termLines.length * LINE_H + 2 : 0;
    const payH = 22 + 4 + 20 + payments.length * 20 + 7.2 + 12 + termsH + 10 + 4;
    { const ny = ensureRoom(y + 14.4, payH); y = movedToNewPage(y + 14.4, ny) ? ny : y + 14.4; }
    y = sectionHeader("PAYMENT TERMS", y) + 4;
    doc.setFillColor(...SLATE);
    doc.rect(lm, y, rw, 20, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(1);
    doc.line(lm, y + 20, lm + rw, y + 20);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
    doc.text("Phase", lm + 10, y + 13);
    doc.text("Due date", lm + rw * 0.28, y + 13);
    doc.text("%", lm + rw * 0.75, y + 13, { align: "right" });
    doc.text("Amount", lm + rw - 6, y + 13, { align: "right" });
    y += 20;
    payments.forEach(([phase, trigger, pct, amt], i) => {
      const bg = i % 2 === 0 ? [255, 251, 242] : MIST;
      doc.setFillColor(...bg);
      doc.rect(lm, y, rw, 20, "F");
      if (i === 0) { doc.setFillColor(...GOLD); doc.rect(lm, y, 3, 20, "F"); }
      doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.3);
      doc.line(lm, y + 20, lm + rw, y + 20);
      doc.setFontSize(8.5); doc.setFont("helvetica", i === 0 ? "bold" : "normal");
      doc.setTextColor(...(i === 0 ? GOLD : INK));
      doc.text(phase, lm + 10, y + 13);
      doc.setTextColor(...INK); doc.setFont("helvetica", "normal");
      doc.text(trigger, lm + rw * 0.28, y + 13);
      doc.text(pct, lm + rw * 0.75, y + 13, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(amt, lm + rw - 6, y + 13, { align: "right" });
      y += 20;
    });
    y += 7.2;
    // Accepted payment methods — mirrors the options offered at the payment stage.
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...SLATE);
    doc.text("Payment methods:", lm, y);
    const mLbl = doc.getTextWidth("Payment methods: ");
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
    doc.text("Zelle (preferred), Certified Check, Cash, Card, Wire", lm + mLbl, y);
    y += 12;
    if (termLines.length) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      termLines.forEach((ln, i) => doc.text(ln, lm, y + i * LINE_H));
      y += termsH;
    }
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(74, 82, 112);
    doc.text("Price subject to applicable sales tax. Proposal valid 7 days from issue.", lm, y);
    y += 4;

    // Acceptance / signature — one block (heading, instruction, name/date/total box, signature,
    // prepared-by); moves whole to the next page rather than splitting the signature fields.
    const acceptH = 22 + 7.2 + 14.4 + 72 + 6;
    { const ny = ensureRoom(y + 21.6, acceptH); y = movedToNewPage(y + 21.6, ny) ? ny : y + 21.6; }
    y = sectionHeader("ACCEPTANCE OF PROPOSAL", y) + 7.2;
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
    doc.text("By signing below, the client agrees to all terms, scope, and pricing outlined in this proposal.", lm, y);
    y += 14.4;

    doc.setFillColor(...WHITE);
    doc.rect(lm, y, rw, 72, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(2);
    doc.line(lm, y, lm + rw, y);
    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.5);
    doc.rect(lm, y, rw, 72, "S");

    const accepted = (p.accepted_options || []).includes(opt.id);
    const declined = p.declined_options && Object.prototype.hasOwnProperty.call(p.declined_options, opt.id);
    const signedDate = fmtSignStamp(p.signed_at);

    const sc = [lm + 8, lm + rw * 0.42, lm + rw * 0.72];
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
    doc.text("CLIENT NAME", sc[0], y + 12);
    doc.text("DATE", sc[1], y + 12);
    doc.text("TOTAL", sc[2], y + 12);
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    if (accepted && p.signed_name) doc.text(p.signed_name, sc[0], y + 26);
    if (accepted && signedDate) doc.text(signedDate, sc[1], y + 26);
    doc.setFontSize(13); doc.setTextColor(...SLATE);
    doc.text("$" + money(t.grand), lm + rw - 6, y + 26, { align: "right" });

    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.4);
    doc.line(lm, y + 36, lm + rw, y + 36);

    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
    doc.text("AUTHORIZED SIGNATURE", sc[0], y + 48);

    // Fillable-PDF fields: while the proposal isn't signed, drop real AcroForm text fields over the
    // name / date / signature lines so the customer can fill it in and sign right in a PDF reader.
    const fillableBox = (x, yTop, w, h) => {
      doc.setFillColor(250, 248, 243); doc.setDrawColor(212, 205, 191); doc.setLineWidth(0.5);
      doc.roundedRect(x, yTop, w, h, 2, 2, "FD");
    };
    const addField = (name, x, yTop, w, h, fontSize) => {
      try {
        const fld = new AcroFormTextField();
        fld.Rect = [x, yTop, w, h];
        fld.fieldName = name;
        fld.value = "";
        fld.fontSize = fontSize || 10;
        doc.addField(fld);
      } catch { /* viewer/build without AcroForm — the printed box below still works by hand */ }
    };

    if (accepted && p.signature_data) {
      // Drawn signature imported from the customer's on-screen acceptance.
      try { doc.addImage(p.signature_data, "PNG", sc[0], y + 50, 132, 22); } catch { /* bad data url — fall back to name */ }
      // Green ACCEPTED stamp sits in the MIDDLE column — the right column holds PREPARED BY / the
      // preparer's name, so a right-aligned stamp there collided with it. Middle is clear of both
      // the signature (left) and the preparer (right).
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(29, 122, 58);
      doc.text("ACCEPTED", sc[1], y + 64);
    } else if (accepted) {
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(p.signed_name || "Accepted", sc[0], y + 64);
    } else if (declined) {
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(140, 47, 47);
      doc.text("DECLINED", sc[0], y + 64);
    } else {
      // Name + Date fields (row 1, under their labels) and the Signature field (row 2).
      fillableBox(sc[0] - 3, y + 15, (sc[1] - sc[0]) - 12, 15);
      fillableBox(sc[1] - 3, y + 15, (sc[2] - sc[1]) - 12, 15);
      fillableBox(sc[0] - 3, y + 51, rw * 0.5, 16);
      addField("proposal_" + propNum + "_name_" + opt.id, sc[0], y + 16, (sc[1] - sc[0]) - 14, 13, 10);
      addField("proposal_" + propNum + "_date_" + opt.id, sc[1], y + 16, (sc[2] - sc[1]) - 14, 13, 10);
      addField("proposal_" + propNum + "_sign_" + opt.id, sc[0], y + 52, rw * 0.5 - 6, 14, 14);
    }

    if (p.created_by_name) {
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
      doc.text("PREPARED BY", lm + rw - 6, y + 48, { align: "right" });
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(p.created_by_name, lm + rw - 6, y + 62, { align: "right" });
    }
  });

  // ---- Appendix: system mockup photos + pinned site-survey floor plans ----
  // Scale a data-URL image to fit within (maxW × maxH), preserving aspect ratio.
  const fit = (dataUrl, maxW, maxH) => {
    try {
      const pr = doc.getImageProperties(dataUrl);
      let w = maxW, h = (w * pr.height) / pr.width;
      if (h > maxH) { h = maxH; w = (h * pr.width) / pr.height; }
      return { w, h, type: pr.fileType === "PNG" ? "PNG" : "JPEG" };
    } catch { return null; }
  };

  // Mockup: each page is the iPhone-frame + camera-grid composite the mockup tool renders (landscape).
  // Two per PDF page, stacked, each near full-width with a gold border hugging it. Only present when
  // the tool had real photos (the caller skips the render otherwise).
  const mockupImages = (attachments.mockupImages || []).filter((x) => typeof x === "string" && x.startsWith("data:image"));
  const surveyImages = (attachments.surveyImages || []).filter((f) => f && f.img);
  const margin = 28.8, availW = W - 2 * margin, pad = 8;

  if (mockupImages.length) {
    currentSection = "Mockup";
    let y = 0;
    mockupImages.forEach((src, i) => {
      const d = fit(src, availW - 2 * pad, 250);   // cap height so two stack on one page
      if (!d) return;
      if (i % 2 === 0) { y = newPage(); y = sectionHeader("SYSTEM MOCKUP", y) + 14; }
      const imgX = margin + (availW - d.w) / 2;
      doc.setDrawColor(...GOLD_D); doc.setLineWidth(1);
      doc.rect(imgX - pad, y - pad, d.w + 2 * pad, d.h + 2 * pad, "S");
      try { doc.addImage(src, "JPEG", imgX, y, d.w, d.h); } catch { /* bad image */ }
      y += d.h + 2 * pad + 16;
    });
  }

  if (surveyImages.length) {
    currentSection = "Survey";
    // Validation: every floor image must carry every planner device it holds (never a background-only
    // page). A mismatch is surfaced internally — the survey is still printed, never silently trimmed.
    surveyImages.forEach((f) => {
      if (f.counts && f.counts.canonical !== f.counts.rendered) {
        const msg = `Site survey "${f.name}": planner devices ${f.counts.canonical}, rendered ${f.counts.rendered}`;
        console.error("[proposal-pdf] " + msg); if (meta.__warnings) meta.__warnings.push(msg);
      }
    });
    // Each floor on its own page. The header spans the SAME centered box as the image (symmetric
    // margins) so they line up; the plan is centred in what is left above the device list.
    surveyImages.forEach((f) => {
      let y = newPage();
      // Symmetric section header (matches the centered image box, not the asymmetric text column).
      doc.setFillColor(...SLATE); doc.rect(margin, y, availW, 22, "F");
      doc.setFillColor(...GOLD); doc.rect(margin, y, 3, 22, "F");
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
      doc.text("SITE SURVEY" + (surveyImages.length > 1 && f.name ? " — " + f.name : ""), margin + 10, y + 14.4);
      y += 22 + 14;
      // Device list under the plan: code → name, three columns, as many rows as fit; the image takes the rest.
      const devs = Array.isArray(f.devices) ? f.devices : [];
      const cols = 3, colW = availW / cols, lineH = 11;
      const listRows = devs.length ? Math.ceil(devs.length / cols) : 0;
      const listH = listRows ? listRows * lineH + 12 : 0;
      const availH = (BOTTOM - listH) - y;
      const d = fit(f.img, availW - 2 * pad, availH - 2 * pad);
      if (!d) return;
      const imgX = margin + (availW - d.w) / 2;   // centered horizontally on the page
      const imgY = y + (availH - d.h) / 2;         // centered vertically in the remaining space
      doc.setDrawColor(...GOLD_D); doc.setLineWidth(1);
      doc.rect(imgX - pad, imgY - pad, d.w + 2 * pad, d.h + 2 * pad, "S");   // border hugs the image
      try { doc.addImage(f.img, "PNG", imgX, imgY, d.w, d.h); } catch { /* bad image */ }
      if (listRows) {
        let ly = y + availH + 8;
        doc.setFontSize(7.5); doc.setTextColor(...INK);
        devs.forEach((dv, i) => {
          const cx = margin + (i % cols) * colW, cy = ly + Math.floor(i / cols) * lineH;
          doc.setFont("helvetica", "bold"); doc.text(dv.code, cx, cy);
          doc.setFont("helvetica", "normal"); doc.text(`${dv.label}${dv.kind && !new RegExp(dv.kind, "i").test(dv.label) ? ` · ${dv.kind}` : ""}`.slice(0, 40), cx + 22, cy);
        });
      }
    });
  }
  // Planner ↔ proposal scope check (internal, never alters either): 9 speakers placed vs 10 quoted.
  if (attachments.surveyFloors) {
    for (const m of scopeMismatches(attachments.surveyFloors, renderOptions[0])) { console.warn("[proposal-pdf] scope mismatch — " + m); if (meta.__warnings) meta.__warnings.push("Scope mismatch — " + m); }
  }

  if (meta.__return) return doc;
  const baseName = (customerName || "Client").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`${baseName}_IOT-Techs_${detailed ? "Detailed_" : ""}Proposal.pdf`);
}
export const PDF_PAGE = { W: 612, H: 792, FOOTER_H: 30.24, SAFE_GAP: 14, BOTTOM: 792 - 30.24 - 14, TOP: 140.4 };
