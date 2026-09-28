"use client";
import { createBrandDoc, money, INK, MUTED, GOLD_D } from "./pdf-chrome.js";
import { workOrderScope } from "./workorder-scope.js";
import { fmtSignStamp, titleCase, displayOptionName } from "./proposal.js";
import { DOC, documentFilename } from "./doc-filename.js";

// Work Order PDF — the tech's sheet as a file: job site, assigned tech, install date, equipment
// locations, equipment to load, labor with payout rates, acceptance. Reads techPrice only (the
// proposal reaching this code is already role-sanitized); retail never appears. Same scope derivation
// as the on-screen work order (lib/workorder-scope.js). Named by lib/doc-filename.js.
export function downloadWorkOrderPdf(p, meta = {}) {
  const { fileBase, customerName, customerAddress, techName, installDate, optionId } = meta;
  const opts = p?.payload?.options || [];
  const opt = opts.find((o) => o.id === (optionId || p?.selected_option)) || opts[0];
  const woNum = "WO-" + String(p?.id || "0").padStart(4, "0") + "-v" + (p?.version || 1);
  const woDate = p?.sent_at ? new Date(String(p.sent_at).replace(" ", "T")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const c = createBrandDoc({ docLabel: "WORK ORDER", rightLines: [woNum, woDate, installDate ? `Install ${installDate}` : null], section: "Work Order", meta });
  const { doc, lm, rw } = c;
  let y = c.newPage();
  y = c.infoStrip(y, { name: customerName, address: customerAddress, pairs: [["Technician", techName || (p?.tech_signed_name || null)], ["Install date", installDate], ["Option", opts.length > 1 && opt ? `${opt.id} · ${displayOptionName(opt.name)}` : null]] });
  if (!opt) { doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text("No active work order yet.", lm, y + 10); return c.finish(documentFilename(fileBase, { type: DOC.WORK_ORDER })); }

  const s = workOrderScope(opt);
  const rate = (n) => (s.ratesPending ? "TBD" : "$" + money(n));
  const eqRate = (n) => (s.equipHasPay ? rate(n) : "—");

  // ① Where everything goes
  y = c.ensureRoom(y, 22 + 6 + 15);
  y = c.sectionHeader("EQUIPMENT LOCATIONS", y) + 6;
  if (s.locations.length) {
    const colW = rw / 2;
    s.locations.forEach((l, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      if (col === 0) { const ny = c.ensureRoom(y, 15); y = ny; }
      const x = lm + col * colW, yy = y;
      doc.setFillColor(...INK); doc.circle(x + 7, yy + 5, 6, "F");
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255); doc.text(String(i + 1), x + 7, yy + 7.2, { align: "center" });
      doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(titleCase(l.name) + (l.outdoor ? "  (outdoor)" : ""), colW - 24)[0], x + 18, yy + 8);
      if (l.gear) { doc.setFontSize(6.8); doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED); doc.text(doc.splitTextToSize(l.gear, colW - 24)[0], x + 18, yy + 16); }
      if (col === 1 || i === s.locations.length - 1) y += 22;
      void row;
    });
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD_D); doc.text(`Total locations: ${s.locations.length}`, lm, y + 6);
    y += 14;
  } else { doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text("No placed locations.", lm, y + 8); y += 16; }
  if (s.notes.length) { doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...INK); const lines = doc.splitTextToSize(s.notes.join("\n"), rw); y = c.ensureRoom(y, lines.length * 11 + 6); doc.text(lines, lm, y + 8); y += lines.length * 11 + 8; }

  // ② What to load on the truck
  y = c.ensureRoom(y, 22 + 6 + 35);
  y = c.sectionHeader("EQUIPMENT", y) + 6;
  const cols = [{ title: "#", w: 0.06 }, { title: "Item", w: 0.54 }, { title: "Qty", w: 0.12, align: "right" }, { title: "Rate", w: 0.14, align: "right" }, { title: "Total", w: 0.14, align: "right", bold: true }];
  y = s.equipment.length ? c.table(y, cols, s.equipment.map((e, i) => [i + 1, e.name, e.qty, eqRate(e.rate), eqRate(e.sum)])) : (doc.setFontSize(8.5), doc.setTextColor(...MUTED), doc.text("No equipment on this option.", lm, y + 8), y + 16);

  // ③ The work itself, with payout rates
  y = c.ensureRoom(y, 8 + 22 + 6 + 35);
  y += 8;
  y = c.sectionHeader("LABOR", y) + 6;
  y = s.labor.length ? c.table(y, [{ ...cols[0] }, { ...cols[1], title: "Task" }, cols[2], cols[3], cols[4]], s.labor.map((l, i) => [i + 1, l.name, l.qty, rate(l.rate), rate(l.sum)])) : (doc.setFontSize(8.5), doc.setTextColor(...MUTED), doc.text("No labor lines on this option.", lm, y + 8), y + 16);
  y = c.ensureRoom(y, 44);
  doc.setFillColor(...INK); doc.rect(lm, y + 4, rw, 26, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(250, 248, 244); doc.text("WORK ORDER TOTAL", lm + 10, y + 21, { charSpace: 1 });
  doc.setFontSize(12); doc.setTextColor(201, 169, 110); doc.text(s.ratesPending ? "TBD" : "$" + money(s.total), lm + rw - 8, y + 21.5, { align: "right" });
  y += 34;
  doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED); doc.text(s.ratesPending ? "Payout rates pending." : "Confirm scope on site.", lm, y + 4);
  y += 12;

  // Acceptance — one block, never split
  y = c.ensureRoom(y, 22 + 60);
  y = c.sectionHeader("WORK ORDER ACCEPTANCE", y) + 8;
  if (p?.tech_signed_name) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text(`Accepted & assigned to ${p.tech_signed_name}${p.tech_signed_at ? ` · ${fmtSignStamp(p.tech_signed_at)}` : ""}`, lm, y + 10);
    if (p.tech_signature_data) { try { doc.addImage(p.tech_signature_data, "PNG", lm, y + 16, 132, 22); } catch { /* fall back to the typed name */ } }
    y += 44;
  } else {
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
    doc.text("I accept this work order, confirm I can perform the scope described, and agree to be assigned this job.", lm, y + 8);
    doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(lm, y + 44, lm + rw * 0.55, y + 44); doc.line(lm + rw * 0.65, y + 44, lm + rw, y + 44);
    doc.setFontSize(7); doc.text("TECHNICIAN SIGNATURE", lm, y + 52, { charSpace: 1 }); doc.text("DATE", lm + rw * 0.65, y + 52, { charSpace: 1 });
    y += 58;
  }
  return c.finish(documentFilename(fileBase, { type: DOC.WORK_ORDER }));
}
