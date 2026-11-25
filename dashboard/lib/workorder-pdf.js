"use client";
import { createBrandDoc, money, INK, MUTED, GOLD_D } from "./pdf-chrome.js";
import { workOrderScope } from "./workorder-scope.js";
import { fmtSignStamp, titleCase, displayOptionName } from "./proposal.js";
import { DOC, documentFilename } from "./doc-filename.js";

// Work Order PDF — THE TECHNICIAN'S ONE DOCUMENT. Job site and site contact, assigned tech, scheduled
// date, where every device goes, what to load on the truck, the work itself as a tickable checklist,
// the site survey (floor plan, camera placements, cable routes and aim cones), and acceptance.
//
// Money: it reads techPrice only — the proposal reaching this code is already role-sanitized, so the
// customer's price, the totals and the balance are not merely omitted here, they never arrived. The
// payout block is a further gate on top: `budget` prints the tech's own budget/expenses/remaining,
// `hidePayout` prints no money at all (an hourly or salaried tech, or a job where the office turned
// payouts off), and neither prints the office's plain work-order total as before.
//
// Same scope derivation as the on-screen work order (lib/workorder-scope.js) and the same survey
// renderer as the proposal appendix (lib/pdf-chrome surveyFloor), so the sheet, the file and the
// planner cannot disagree. Named by lib/doc-filename.js.
//
// Stays SYNCHRONOUS: rasterizing the survey floors is the caller's job (exportSurvey2Images, in the
// browser), exactly as the proposal PDF takes `attachments.surveyImages`. Callers that pass none get
// the document with no survey pages and otherwise behave exactly as before.
export function downloadWorkOrderPdf(p, meta = {}) {
  const { fileBase, customerName, customerAddress, customerPhone, siteContact, techName, installDate, optionId,
          surveyImages = [], budget = null, hidePayout = false } = meta;
  const opts = p?.payload?.options || [];
  const opt = opts.find((o) => o.id === (optionId || p?.selected_option)) || opts[0];
  const woNum = "WO-" + String(p?.id || "0").padStart(4, "0") + "-v" + (p?.version || 1);
  const woDate = p?.sent_at ? new Date(String(p.sent_at).replace(" ", "T")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const c = createBrandDoc({ docLabel: "WORK ORDER", rightLines: [woNum, woDate, installDate ? `Install ${installDate}` : null], section: "Work Order", meta });
  const { doc, lm, rw } = c;
  let y = c.newPage();
  // Job info: who, where, who to call on site, when, and whose job it is. The site contact and phone
  // are what actually gets a technician through the door, and they were missing from this sheet.
  y = c.infoStrip(y, { name: customerName, address: customerAddress, pairs: [
    ["Site contact", siteContact && siteContact !== customerName ? siteContact : null],
    ["Phone", customerPhone || null],
    ["Technician", techName || (p?.tech_signed_name || null)],
    ["Scheduled", installDate],
    ["Option", opts.length > 1 && opt ? `${opt.id} · ${displayOptionName(opt.name)}` : null],
  ] });
  if (!opt) { doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text("No active work order yet.", lm, y + 10); return c.finish(documentFilename(fileBase, { type: DOC.WORK_ORDER })); }

  const s = workOrderScope(opt);
  // A sheet with no money on it drops the rate/total columns rather than printing dashes down the page.
  const rate = (n) => (s.ratesPending ? "TBD" : "$" + money(n));
  const eqRate = (n) => (s.equipHasPay ? rate(n) : "—");
  const showMoney = !hidePayout;

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
  const moneyCols = [{ title: "Rate", w: 0.14, align: "right" }, { title: "Total", w: 0.14, align: "right", bold: true }];
  const cols = showMoney
    ? [{ title: "#", w: 0.06 }, { title: "Item", w: 0.54 }, { title: "Qty", w: 0.12, align: "right" }, ...moneyCols]
    : [{ title: "#", w: 0.06 }, { title: "Item", w: 0.72 }, { title: "Qty", w: 0.22, align: "right" }];
  const eqRow = (e, i) => (showMoney ? [i + 1, e.name, e.qty, eqRate(e.rate), eqRate(e.sum)] : [i + 1, e.name, e.qty]);
  y = s.equipment.length ? c.table(y, cols, s.equipment.map(eqRow)) : (doc.setFontSize(8.5), doc.setTextColor(...MUTED), doc.text("No equipment on this option.", lm, y + 8), y + 16);

  // ③ The work itself — a TASK CHECKLIST, not a price list. The box is the point: this sheet goes in a
  // van and gets ticked. The payout columns ride along only when this technician is paid per job.
  y = c.ensureRoom(y, 8 + 22 + 6 + 35);
  y += 8;
  y = c.sectionHeader("TASKS", y) + 6;
  const taskCols = showMoney
    ? [{ title: "✓", w: 0.06 }, { title: "Task", w: 0.54 }, { title: "Qty", w: 0.12, align: "right" }, ...moneyCols]
    : [{ title: "✓", w: 0.06 }, { title: "Task", w: 0.72 }, { title: "Qty", w: 0.22, align: "right" }];
  const taskTop = y;
  const taskRow = (l) => (showMoney ? ["", l.name, l.qty, rate(l.rate), rate(l.sum)] : ["", l.name, l.qty]);
  y = s.labor.length ? c.table(y, taskCols, s.labor.map(taskRow)) : (doc.setFontSize(8.5), doc.setTextColor(...MUTED), doc.text("No tasks on this option.", lm, y + 8), y + 16);
  // Draw the tick boxes down the first column, one per row (the table's rows are a fixed 17pt and
  // start one header row — 22pt — below the top).
  if (s.labor.length) {
    doc.setDrawColor(...INK); doc.setLineWidth(0.7);
    s.labor.forEach((_, i) => { try { doc.rect(lm + 6, taskTop + 22 + i * 17 + 4, 9, 9, "S"); } catch { /* off-page row */ } });
  }

  // ④ The money — only the technician's own, and only when there is an honest figure to print.
  if (budget) {
    // A tech paid per job: their budget for this job, what they have spent against it, what is left.
    y = c.ensureRoom(y, 52);
    doc.setFillColor(...INK); doc.rect(lm, y + 4, rw, 40, "F");
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(250, 248, 244);
    doc.text("YOUR JOB BUDGET", lm + 10, y + 18, { charSpace: 1 });
    const cellW = rw / 3;
    [["Budget", budget.budget], ["Expenses", budget.spent], ["Remaining", budget.remaining]].forEach(([label, v], i) => {
      const x = lm + 10 + i * cellW;
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
      doc.text(String(label).toUpperCase(), x, y + 30, { charSpace: 1 });
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(201, 169, 110);
      doc.text("$" + money(v), x, y + 41);
    });
    y += 50;
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED);
    doc.text("Your payout and your own expenses on this job. Confirm scope on site.", lm, y + 4);
    y += 12;
  } else if (showMoney) {
    // The office's sheet: the work-order total as before.
    y = c.ensureRoom(y, 44);
    doc.setFillColor(...INK); doc.rect(lm, y + 4, rw, 26, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(250, 248, 244); doc.text("WORK ORDER TOTAL", lm + 10, y + 21, { charSpace: 1 });
    doc.setFontSize(12); doc.setTextColor(201, 169, 110); doc.text(s.ratesPending ? "TBD" : "$" + money(s.total), lm + rw - 8, y + 21.5, { align: "right" });
    y += 34;
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED); doc.text(s.ratesPending ? "Payout rates pending." : "Confirm scope on site.", lm, y + 4);
    y += 12;
  } else {
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED); doc.text("Confirm scope on site.", lm, y + 4);
    y += 12;
  }

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

  // ⑤ THE SITE SURVEY — the floor plan or aerial with every placed device, the cable routes between
  // them and the aim cone on anything that was aimed. One landscape sheet per floor, rendered by the
  // SAME lib/pdf-chrome surveyFloor the proposal's appendix uses, from the same lib/survey2-export
  // raster, so what the technician carries is what the planner drew. Skipped silently when there is
  // no survey to show — a header over an empty page helps nobody.
  const floors = (surveyImages || []).filter((f) => f && f.img);
  floors.forEach((f, i) => {
    c.surveyFloor(f, {
      eyebrow: "SITE SURVEY",
      floorLabel: floors.length > 1 ? (f.name || `Floor ${i + 1}`) : "",
      metaLines: [customerName, customerAddress].filter(Boolean),
    });
  });

  return c.finish(documentFilename(fileBase, { type: DOC.WORK_ORDER }));
}
