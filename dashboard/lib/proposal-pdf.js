"use client";
import { jsPDF } from "jspdf";
import { optionTotals, itemTotal, titleCase, fmtSignStamp, PAYMENT_PLANS } from "./proposal";

// Ported from the legacy calculator's own PDF export (IOTTechs_ProposalCalculator.html
// generatePDF) so the downloaded document matches the owner's established brand proposal —
// same layout, colors, and section styling, adapted to read from the new multi-option /
// per-service proposal data model instead of the legacy flat LABOR/EQUIPMENT sections.
const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function downloadProposalPdf(p, meta = {}) {
  const { customerName, customerAddress, customerPhone, customerEmail } = meta;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const W = 612, H = 792;
  const INK = [11, 15, 26];
  const GOLD = [201, 169, 110];
  const GOLD_D = [160, 120, 64];
  const SLATE = [44, 51, 71];
  const CREAM = [250, 248, 244];
  const MIST = [240, 237, 232];
  const WHITE = [255, 255, 255];
  const lm = 57.6;
  const rw = W - lm - 28.8;

  const propNum = "PROP-" + String(p.id || "0").padStart(4, "0") + "-v" + (p.version || 1);
  const propDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function drawHeader() {
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
    doc.rect(39.6, 0, W - 39.6, 122.4, "F");
    doc.setFillColor(...GOLD);
    doc.rect(39.6, 0, W - 39.6, 3.24, "F");

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
    doc.text("SYSTEM PROPOSAL", W - 28.8, 37.44, { align: "right" });
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
    doc.line(W - 28.8 - doc.getTextWidth("SYSTEM PROPOSAL"), 41.04, W - 28.8, 41.04);

    doc.setFillColor(...GOLD);
    doc.roundedRect(W - 180, 50.76, 151.2, 17.28, 2.88, 2.88, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("SECURITY & LOW VOLTAGE", W - 104.4, 62.28, { align: "center" });

    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(170, 170, 170);
    doc.text(propDate, W - 28.8, 77.76, { align: "right" });
    doc.text("Proposal #: " + propNum, W - 28.8, 88.56, { align: "right" });
  }

  function drawFooter() {
    doc.setFillColor(...INK);
    doc.rect(39.6, H - 30.24, W - 39.6, 30.24, "F");
    doc.setFillColor(...GOLD);
    doc.rect(39.6, H - 30.24, W - 39.6, 1.44, "F");
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(136, 136, 136);
    doc.text("IOT TECHS  ·  (646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com  ·  Confidential Proposal", W / 2 + 18, H - 10.08, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    doc.text("Page " + doc.getNumberOfPages(), W - 28.8, H - 10.08, { align: "right" });
  }

  function newPage() {
    doc.addPage();
    drawHeader();
    drawFooter();
    return 140.4;
  }
  const ensureRoom = (y, need) => (y + need > H - 50 ? newPage() : y);

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

  const tableRow = (num, desc, qty, unit, total, yPos) => {
    const bg = rowIdx % 2 === 0 ? WHITE : MIST;
    doc.setFillColor(...bg);
    doc.rect(lm, yPos, rw, 18, "F");
    doc.setDrawColor(221, 216, 206); doc.setLineWidth(0.3);
    doc.line(lm, yPos + 18, lm + rw, yPos + 18);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
    doc.text(num, lm + 12, yPos + 12, { align: "center" });
    doc.text(String(desc), lm + 22, yPos + 12, { maxWidth: rw * 0.66 });
    doc.text(qty, lm + rw * 0.72, yPos + 12, { align: "center" });
    doc.text(unit, lm + rw * 0.86, yPos + 12, { align: "right" });
    doc.text(total, lm + rw - 6, yPos + 12, { align: "right" });
    rowIdx++;
    return yPos + 18;
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

  p.payload.options.forEach((opt, oi) => {
    if (oi > 0) doc.addPage();
    drawHeader();
    drawFooter();
    let y = 140.4;

    if (p.payload.options.length > 1) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...SLATE);
      doc.text(`Option ${opt.id} — ${opt.name}`, lm, y);
      y += 14.4;
    }

    // Client info box
    const infoH = 64.8;
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

    // Project cost breakdown — one section per service, one row per line item
    // (a camera/Toast block collapses to its own all-in total, same as the on-screen view)
    y = sectionHeader("PROJECT COST BREAKDOWN", y) + 4;
    y = tableHeader(y);
    rowIdx = 0;
    let lineNum = 1;

    (opt.services || []).forEach((svc) => {
      if (!svc.items?.length) return;
      y = ensureRoom(y, 60);
      doc.setFillColor(...INK);
      doc.rect(lm, y, rw, 16, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
      doc.text(svc.label.toUpperCase(), lm + 10, y + 11);
      y += 16;

      let secTotal = 0;
      svc.items.forEach((it) => {
        y = ensureRoom(y, 30);
        const tot = itemTotal(it);
        const gross = it.waived ? itemTotal({ ...it, waived: false }) : tot;
        secTotal += tot;
        const hasSub = (it.sub || []).length > 0;
        y = tableRow(
          String(lineNum), titleCase(it.name) + (it.waived ? "  — WAIVED" : ""),
          hasSub ? "1" : String(it.qty ?? 1),
          "$" + money(hasSub ? gross : it.price),
          it.waived ? "$0.00 (waived $" + money(gross) + ")" : "$" + money(tot), y
        );
        lineNum++;
      });
      y = subtotalRow(svc.label + " Subtotal", "$" + money(secTotal), y);
      y += 4;
    });

    const t = optionTotals(opt, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);
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

    // Payment terms — split by the option's own deposit %
    y += 14.4;
    y = ensureRoom(y, 60);
    y = sectionHeader("PAYMENT TERMS", y) + 4;
    doc.setFillColor(...SLATE);
    doc.rect(lm, y, rw, 20, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(1);
    doc.line(lm, y + 20, lm + rw, y + 20);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...CREAM);
    doc.text("Phase", lm + 10, y + 13);
    doc.text("Trigger", lm + rw * 0.28, y + 13);
    doc.text("%", lm + rw * 0.75, y + 13, { align: "right" });
    doc.text("Amount", lm + rw - 6, y + 13, { align: "right" });
    y += 20;

    const depositPct = +p.deposit_pct || 50;
    const finalPct = 100 - depositPct;
    const payPlan = p.payload.payment_plan || "custom";
    const payments = payPlan === "50_30_20"
      ? [
          ["Deposit", "To begin", "50%", "$" + money(t.grand * 0.5)],
          ["Progress", "At project midpoint", "30%", "$" + money(t.grand * 0.3)],
          ["Final", "Upon completion (or Net 30)", "20%", "$" + money(t.grand * 0.2)],
        ]
      : payPlan === "50_50"
      ? [
          ["Deposit", "Before we begin", "50%", "$" + money(t.grand * 0.5)],
          ["Final", "Upon completion", "50%", "$" + money(t.grand * 0.5)],
        ]
      : [
          ["Deposit", "Before project start", depositPct + "%", "$" + money(t.grand * depositPct / 100)],
          ["Final", "Upon completion", finalPct + "%", "$" + money(t.grand * finalPct / 100)],
        ];
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
    const planTerms = PAYMENT_PLANS[payPlan]?.terms;
    if (planTerms) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(planTerms, rw), lm, y);
      y += 12;
    }
    doc.setFontSize(7.5); doc.setFont("helvetica", "oblique"); doc.setTextColor(74, 82, 112);
    doc.text("Price subject to applicable sales tax. Proposal valid 7 days from issue.", lm, y);

    // Acceptance / signature
    y = ensureRoom(y, 130);
    y += 21.6;
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
    if (accepted && p.signature_data) {
      // Drawn signature imported from the customer's on-screen acceptance.
      try { doc.addImage(p.signature_data, "PNG", sc[0], y + 50, 132, 22); } catch { /* bad data url — fall back to name */ }
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(29, 122, 58);
      doc.text("ACCEPTED", lm + rw - 6, y + 64, { align: "right" });
    } else if (accepted) {
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(p.signed_name || "Accepted", sc[0], y + 64);
    } else if (declined) {
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(140, 47, 47);
      doc.text("DECLINED", sc[0], y + 64);
    } else {
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text("X  ___________________________________", sc[0], y + 64);
    }

    if (p.created_by_name) {
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(74, 82, 112);
      doc.text("PREPARED BY", lm + rw - 6, y + 48, { align: "right" });
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
      doc.text(p.created_by_name, lm + rw - 6, y + 62, { align: "right" });
    }
  });

  const baseName = (customerName || "Client").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`${baseName}_IOT-Techs_Proposal.pdf`);
}
