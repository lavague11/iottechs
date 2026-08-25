"use client";
import { jsPDF } from "jspdf";

// Brand invoice for a project: what was charged (accepted proposal + approved add-ons), what's been
// paid (each confirmed payment), and the balance due. The caller passes the already-computed money
// picture (`figs`) so the PDF always matches the numbers on screen — no re-deriving totals here.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => { if (!d) return ""; try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d).slice(0, 10); } };
const titleCaseX = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

export function downloadInvoicePdf(meta = {}, figs = {}, payments = []) {
  const { customerName, customerAddress, customerPhone, customerEmail, invoiceNo, proposalNo, issuedAt, projectId, depositPct } = meta;
  const { lines = [], grandWithAddons = 0, paidTotal = 0, balance = 0 } = figs;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = 612;
  const INK = [11, 15, 26], GOLD = [201, 169, 110], GOLD_D = [160, 120, 64];
  const META = [120, 125, 132], LINE = [228, 228, 223], PAPER = [244, 244, 242], GREEN = [46, 125, 91], RED = [196, 85, 61];
  const lm = 48, rm = W - 48;
  const rt = (t, x, y) => doc.text(String(t), x, y, { align: "right" });

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...INK); doc.rect(0, 0, W, 96, "F");
  doc.setFillColor(...GOLD); doc.rect(0, 96, W, 3, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("IOT TECHS", lm, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(180, 184, 190);
  doc.text("Secure Tomorrow. Today.", lm, 60);
  doc.text("(646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com", lm, 74);
  doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  rt("INVOICE", rm, 42);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(210, 214, 220);
  if (invoiceNo) rt(invoiceNo, rm, 60);
  rt(issuedAt || fmtDay(new Date().toISOString()), rm, 73);
  if (proposalNo) rt("Ref " + proposalNo, rm, 86);

  // ── Bill To ──────────────────────────────────────────────────────────────
  let y = 128;
  doc.setTextColor(...META); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("BILL TO", lm, y);
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(titleCaseX(customerName) || "Customer", lm, y + 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 76, 84);
  let by = y + 31;
  [customerAddress, customerPhone, customerEmail, projectId && ("Project " + projectId)].filter(Boolean).forEach((t) => { doc.text(String(t), lm, by); by += 13; });

  // ── Charges ──────────────────────────────────────────────────────────────
  y = Math.max(by + 14, 196);
  doc.setFillColor(...INK); doc.rect(lm, y, rm - lm, 22, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("DESCRIPTION", lm + 12, y + 14.5); rt("AMOUNT", rm - 12, y + 14.5);
  y += 22;
  lines.forEach((ln, i) => {
    const h = ln.sub ? 32 : 20;                       // taller row when there's a "what's included" sub-line
    if (i % 2) { doc.setFillColor(...PAPER); doc.rect(lm, y, rm - lm, h, "F"); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    doc.text(String(ln.label || ""), lm + 12, y + 13.5);
    rt(money(ln.amount), rm - 12, y + 13.5);
    if (ln.sub) { doc.setFontSize(8); doc.setTextColor(...META); doc.text(String(ln.sub), lm + 12, y + 25); }
    doc.setDrawColor(...LINE); doc.line(lm, y + h, rm, y + h);
    y += h;
  });
  // Grand total row
  doc.setFillColor(...PAPER); doc.rect(lm, y, rm - lm, 26, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1); doc.line(lm, y, rm, y); doc.setLineWidth(0.2);
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  doc.text("Total", lm + 12, y + 17); rt(money(grandWithAddons), rm - 12, y + 17);
  y += 30;
  if (depositPct) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...META);
    doc.text(`Terms: ${depositPct}% deposit before we begin  ·  balance of ${100 - depositPct}% on completion.`, lm + 2, y + 6);
    y += 14;
  }
  y += 12;

  // ── Payments received ──────────────────────────────────────────────────────
  doc.setTextColor(...META); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("PAYMENTS RECEIVED", lm, y); y += 8;
  doc.setDrawColor(...LINE); doc.line(lm, y, rm, y); y += 15;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  const received = payments.filter((pmt) => String(pmt.status || "confirmed") !== "pending");
  if (received.length) {
    received.forEach((pmt) => {
      const bits = [fmtDay(pmt.paid_at || pmt.created_at), titleCaseX(pmt.kind), pmt.method].filter(Boolean).join("  ·  ");
      doc.setTextColor(70, 76, 84); doc.text(bits, lm + 2, y);
      doc.setTextColor(...GREEN); rt("+ " + money(pmt.amount), rm - 2, y);
      y += 15;
    });
  } else {
    doc.setTextColor(...META); doc.text("No payments received yet.", lm + 2, y); y += 15;
  }
  doc.setDrawColor(...LINE); doc.line(lm, y - 3, rm, y - 3); y += 6;
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  doc.text("Total received", lm + 2, y + 5); doc.setTextColor(...GREEN); rt(money(paidTotal), rm - 2, y + 5);
  y += 28;

  // ── Balance due ────────────────────────────────────────────────────────────
  const paid = balance <= 0.005;
  doc.setFillColor(...(paid ? [18, 50, 31] : INK)); doc.roundedRect(lm, y, rm - lm, 46, 8, 8, "F");
  doc.setTextColor(...(paid ? [127, 224, 171] : GOLD)); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(paid ? "PAID IN FULL" : "BALANCE DUE", lm + 16, y + 20);
  doc.setTextColor(255, 255, 255); doc.setFontSize(20);
  rt(money(Math.max(0, balance)), rm - 16, y + 30);
  y += 66;

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.setTextColor(...META); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("Zelle preferred. Thank you for your business.  ·  IOT TECHS  ·  support@iot-techs.com", lm, 762);

  // ── Page 2+: full payment records (the complete ledger from the payment tool) ─
  if (payments.length) {
    doc.addPage();
    doc.setFillColor(...INK); doc.rect(0, 0, W, 70, "F");
    doc.setFillColor(...GOLD); doc.rect(0, 70, W, 3, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("PAYMENT RECORDS", lm, 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(180, 184, 190);
    doc.text([invoiceNo, titleCaseX(customerName)].filter(Boolean).join("  ·  "), lm, 56);

    let yy = 100;
    const head = () => {
      doc.setFillColor(...INK); doc.rect(lm, yy, rm - lm, 20, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text("DATE", lm + 6, yy + 13); doc.text("TYPE", lm + 96, yy + 13); doc.text("METHOD", lm + 162, yy + 13);
      doc.text("REFERENCE", lm + 250, yy + 13); doc.text("STATUS", lm + 384, yy + 13); rt("AMOUNT", rm - 6, yy + 13);
      yy += 20;
    };
    head();
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    payments.forEach((pmt, i) => {
      if (yy > 742) { doc.addPage(); yy = 48; head(); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); }
      if (i % 2) { doc.setFillColor(...PAPER); doc.rect(lm, yy, rm - lm, 18, "F"); }
      const pending = String(pmt.status || "confirmed") === "pending";
      doc.setTextColor(...INK);
      doc.text(fmtDay(pmt.paid_at || pmt.created_at) || "—", lm + 6, yy + 12);
      doc.text(titleCaseX(pmt.kind) || "—", lm + 96, yy + 12);
      doc.text(String(pmt.method || "—"), lm + 162, yy + 12);
      doc.text((String(pmt.note || "").slice(0, 22)) || "—", lm + 250, yy + 12);
      doc.setTextColor(...(pending ? GOLD_D : GREEN)); doc.setFont("helvetica", "bold");
      doc.text(pending ? "Pending" : "Received", lm + 384, yy + 12);
      doc.setTextColor(...INK); rt(money(pmt.amount), rm - 6, yy + 12);
      doc.setFont("helvetica", "normal");
      doc.setDrawColor(...LINE); doc.line(lm, yy + 18, rm, yy + 18);
      yy += 18;
    });
    // Totals: received vs still-pending
    const recd = payments.filter((p) => String(p.status || "confirmed") !== "pending").reduce((s, p) => s + (+p.amount || 0), 0);
    const pend = payments.filter((p) => String(p.status || "confirmed") === "pending").reduce((s, p) => s + (+p.amount || 0), 0);
    yy += 14;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    doc.text("Total received", lm + 6, yy); doc.setTextColor(...GREEN); rt(money(recd), rm - 6, yy);
    if (pend > 0.005) { yy += 16; doc.setTextColor(...INK); doc.text("Pending confirmation", lm + 6, yy); doc.setTextColor(...GOLD_D); rt(money(pend), rm - 6, yy); }

    doc.setTextColor(...META); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("Complete payment ledger from the IOT TECHS payment tool.  ·  support@iot-techs.com", lm, 762);
  }

  doc.save(`${invoiceNo || "Invoice"}.pdf`);
}
