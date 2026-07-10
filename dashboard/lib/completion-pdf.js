"use client";
import { jsPDF } from "jspdf";

// Certificate of Completion + warranty as a branded PDF — same visual language as the proposal
// export (lib/proposal-pdf.js): slate side rail, ink header band, gold accents. One page.
export function downloadCompletionPdf(project, meta = {}) {
  const { deviceCount = 0, completedAt, warrantyMonths = 12 } = meta;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const W = 612, H = 792;
  const INK = [11, 15, 26], GOLD = [201, 169, 110], GOLD_D = [160, 120, 64];
  const SLATE = [44, 51, 71], CREAM = [250, 248, 244], GREEN = [47, 125, 90];
  const WHITE = [255, 255, 255], MUTE = [120, 120, 120];
  const lm = 57.6, rw = W - lm - 28.8;

  const fmt = (d) => { if (!d) return "—"; try { return new Date(String(d).includes(" ") || String(d).includes("T") ? String(d).replace(" ", "T") : d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch { return String(d); } };
  const addMonths = (d, m) => { try { const dt = new Date(String(d).replace(" ", "T")); dt.setMonth(dt.getMonth() + m); return dt.toISOString().slice(0, 10); } catch { return null; } };
  const doneDate = completedAt || project.install_date || project.date || null;
  const warrantyEnd = doneDate ? addMonths(doneDate, warrantyMonths) : null;
  const client = project.company_name || project.contact_name || project.customer || "Client";
  const issued = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // ---- Header (brand band + side rail) ----
  doc.setFillColor(...SLATE); doc.rect(0, 0, 39.6, H, "F");
  doc.setFillColor(...GOLD);  doc.rect(32.4, 0, 7.2, H, "F");
  doc.setFontSize(6); doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold");
  doc.saveGraphicsState();
  doc.text("IOT TECHS  ·  LOW VOLTAGE SOLUTIONS  ·  SECURITY  ·  AUDIO", 20.2, H / 2, { angle: 90, align: "center" });
  doc.restoreGraphicsState();

  doc.setFillColor(...INK); doc.rect(39.6, 0, W - 39.6, 122.4, "F");
  doc.setFillColor(...GOLD); doc.rect(39.6, 0, W - 39.6, 3.24, "F");
  doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE);
  doc.text("IOT TECHS", 61.2, 46.8);
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GOLD);
  doc.text("SECURE TOMORROW. TODAY.", 61.2, 60.48);
  doc.setDrawColor(...GOLD_D); doc.setLineWidth(0.5); doc.line(61.2, 66.24, 216, 66.24);
  doc.setFontSize(7.5); doc.setTextColor(170, 170, 170);
  doc.text("(646) 396-0775   ·   support@iot-techs.com   ·   www.iot-techs.com", 61.2, 79.2);
  doc.text("Assigned Contractor: LA VAGUE INC", 61.2, 90.72);

  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
  doc.text("CERTIFICATE OF COMPLETION", W - 28.8, 37.44, { align: "right" });
  doc.setDrawColor(...GOLD); doc.line(W - 28.8 - doc.getTextWidth("CERTIFICATE OF COMPLETION"), 41.04, W - 28.8, 41.04);
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(170, 170, 170);
  doc.text("Issued " + issued, W - 28.8, 77.76, { align: "right" });
  doc.text("Project #: " + (project.access_id || "—"), W - 28.8, 88.56, { align: "right" });

  // ---- Title ----
  let y = 168;
  doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
  doc.text("Certificate of Completion", lm, y);
  y += 16;
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTE);
  doc.text("This certifies that the security system detailed below was installed and passed quality control by IOT TECHS.", lm, y, { maxWidth: rw });
  y += 34;

  // ---- Detail rows ----
  const row = (label, value) => {
    doc.setFillColor(...CREAM); doc.rect(lm, y, rw, 26, "F");
    doc.setFillColor(...GOLD); doc.rect(lm, y, 3, 26, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...SLATE);
    doc.text(String(label).toUpperCase(), lm + 12, y + 16);
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text(String(value), W - 40, y + 16.5, { align: "right" });
    y += 30;
  };
  row("Client", client);
  if (project.address) row("Job Site", project.address);
  row("Devices Installed", String(deviceCount));
  row("Completion Date", fmt(completedAt || doneDate));

  // ---- Warranty band ----
  y += 8;
  doc.setFillColor(...GREEN); doc.rect(lm, y, rw, 24, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...WHITE);
  doc.text(`${warrantyMonths}-MONTH WARRANTY  ·  PARTS & LABOUR`, lm + 12, y + 15.5);
  y += 24;
  doc.setFillColor(245, 249, 246); doc.rect(lm, y, rw, 40, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...SLATE);
  doc.text(doneDate
      ? `In effect ${fmt(doneDate)} through ${fmt(warrantyEnd)}. Covered defects in parts or workmanship are serviced at no charge during this period.`
      : "Coverage begins on the completion date and runs for the full warranty term.",
    lm + 12, y + 16, { maxWidth: rw - 24 });
  y += 62;

  // ---- Signature line ----
  doc.setDrawColor(...SLATE); doc.setLineWidth(0.75);
  doc.line(lm, y, lm + 220, y);
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTE);
  doc.text("Authorized · IOT TECHS", lm, y + 12);
  doc.text("Issued " + issued, lm + 260, y + 12);

  // ---- Footer ----
  doc.setFillColor(...INK); doc.rect(39.6, H - 30.24, W - 39.6, 30.24, "F");
  doc.setFillColor(...GOLD); doc.rect(39.6, H - 30.24, W - 39.6, 1.44, "F");
  doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(136, 136, 136);
  doc.text("IOT TECHS  ·  (646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com", W / 2 + 18, H - 10.08, { align: "center" });

  const safe = String(client).replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`Certificate_of_Completion_${project.access_id || safe}.pdf`);
}
