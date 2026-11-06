// Server-side payment RECEIPT PDF (bytes), attached to the "payment received" email. Plain jsPDF — no
// "use client" — so it renders in the Node email path (like the proposal e-sign source). Customer-facing:
// what was paid, how, when, and the balance that remains. Figures are passed in by the caller so the PDF
// always matches the numbers the payment page showed (never re-derived here).
import { jsPDF } from "jspdf";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KIND_LABEL = { deposit: "Deposit", final: "Final payment", partial: "Partial payment", other: "Payment" };
const fmtDay = (d) => { try { return new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? `${d}T00:00:00` : (d || Date.now())).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return String(d || ""); } };

// meta: { customerName, projectId, receiptNo }. fig: { amount, kind, method, paidAt, balanceAfter, total }.
export function buildReceiptPdfBytes(meta = {}, fig = {}) {
  const { customerName = "", projectId = "", receiptNo = "" } = meta;
  const { amount = 0, kind = "payment", method = "", paidAt = "", balanceAfter = null, total = null } = fig;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = 612, lm = 48, rm = W - 48;
  const INK = [11, 15, 26], GOLD = [201, 169, 110], META = [120, 125, 132], LINE = [228, 228, 223], GREEN = [46, 125, 91];
  const rt = (t, x, y) => doc.text(String(t), x, y, { align: "right" });

  // Header band
  doc.setFillColor(...INK); doc.rect(0, 0, W, 96, "F");
  doc.setFillColor(...GOLD); doc.rect(0, 96, W, 3, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("IOT TECHS", lm, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(180, 184, 190);
  doc.text("Secure Tomorrow. Today.", lm, 60);
  doc.text("(646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com", lm, 74);
  doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold"); doc.setFontSize(15); rt("RECEIPT", rm, 42);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(210, 214, 220);
  if (receiptNo) rt(receiptNo, rm, 60);
  rt(fmtDay(paidAt || new Date().toISOString()), rm, 73);
  if (projectId) rt("Project " + projectId, rm, 86);

  // Bill-to
  let y = 132;
  doc.setTextColor(...META); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("RECEIVED FROM", lm, y);
  doc.setTextColor(...INK); doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.text(customerName || "Customer", lm, y + 18);

  // Amount paid — the hero figure
  y += 64;
  doc.setDrawColor(...LINE); doc.setLineWidth(1); doc.line(lm, y, rm, y);
  y += 30;
  doc.setTextColor(...META); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text((KIND_LABEL[kind] || "Payment").toUpperCase(), lm, y);
  doc.setTextColor(...GREEN); doc.setFont("helvetica", "bold"); doc.setFontSize(26); rt(money(amount), rm, y + 6);

  // Detail rows
  y += 40;
  const row = (label, val) => { if (!val) return; doc.setTextColor(...META); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(label, lm, y); doc.setTextColor(...INK); rt(String(val), rm, y); y += 22; };
  row("Method", method);
  row("Date", fmtDay(paidAt || new Date().toISOString()));
  if (total != null) row("Contract total", money(total));
  if (balanceAfter != null) {
    doc.setDrawColor(...LINE); doc.line(lm, y - 8, rm, y - 8);
    doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Balance remaining", lm, y + 6);
    rt(money(balanceAfter), rm, y + 6); y += 28;
    if (!(balanceAfter > 0)) { doc.setTextColor(...GREEN); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("PAID IN FULL — thank you!", lm, y + 4); }
  }

  // Footer
  doc.setTextColor(...META); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("This receipt confirms the payment above was recorded toward your project. Questions? Reply to your receipt email.", lm, 744);

  return Buffer.from(doc.output("arraybuffer"));
}
