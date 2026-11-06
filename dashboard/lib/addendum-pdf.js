// Server-side add-on (change-order) PDF (bytes), attached to the add-on approval email. Plain jsPDF — no
// "use client" — so it renders in the Node email path. Customer-facing ONLY: the retail line items, the
// add-on total, and the new balance if approved. NEVER the tech payout (project role rule #4). Figures are
// computed from the stored add-on record's customer prices.
import { jsPDF } from "jspdf";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const titleCaseX = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDay = (d) => { try { return new Date(d || Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return ""; } };

// meta: { customerName, projectId }. add: the stored addendum record. fig: { newBalance }.
export function buildAddendumPdfBytes(meta = {}, add = {}, fig = {}) {
  const { customerName = "", projectId = "" } = meta;
  const items = Array.isArray(add.items) ? add.items : [];
  const discount = +add.discount || 0;
  const addTotal = Math.max(0, items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0) - discount);
  const newBalance = fig.newBalance;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = 612, lm = 48, rm = W - 48;
  const INK = [11, 15, 26], GOLD = [201, 169, 110], META = [120, 125, 132], LINE = [228, 228, 223];
  const rt = (t, x, y) => doc.text(String(t), x, y, { align: "right" });

  // Header band
  doc.setFillColor(...INK); doc.rect(0, 0, W, 96, "F");
  doc.setFillColor(...GOLD); doc.rect(0, 96, W, 3, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("IOT TECHS", lm, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(180, 184, 190);
  doc.text("Secure Tomorrow. Today.", lm, 60);
  doc.text("(646) 396-0775  ·  support@iot-techs.com  ·  www.iot-techs.com", lm, 74);
  doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold"); doc.setFontSize(15); rt("CHANGE ORDER", rm, 42);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(210, 214, 220);
  rt(fmtDay(add.at || new Date().toISOString()), rm, 60);
  if (projectId) rt("Project " + projectId, rm, 73);

  // Prepared for + title
  let y = 132;
  doc.setTextColor(...META); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("PREPARED FOR", lm, y);
  doc.setTextColor(...INK); doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.text(customerName || "Customer", lm, y + 18);
  y += 52;
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(add.title || "Job-site add-on", lm, y);

  // Items table
  y += 26;
  doc.setDrawColor(...LINE); doc.setLineWidth(1); doc.line(lm, y, rm, y); y += 20;
  doc.setTextColor(...META); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("ITEM", lm, y); rt("AMOUNT", rm, y); y += 6;
  doc.line(lm, y, rm, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
  for (const it of items) {
    doc.setTextColor(...INK);
    const name = titleCaseX(it.name) + ((+it.qty || 1) > 1 ? `  ×${it.qty}` : "");
    doc.text(name, lm, y);
    rt(money((+it.qty || 0) * (+it.price || 0)), rm, y);
    y += 20;
    if (y > 700) { doc.addPage(); y = 64; }
  }
  if (discount > 0) { doc.setTextColor(...META); doc.text("Discount", lm, y); rt("− " + money(discount), rm, y); y += 20; }

  // Totals
  y += 6; doc.setDrawColor(...LINE); doc.line(lm, y, rm, y); y += 24;
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Add-on total", lm, y); rt(money(addTotal), rm, y); y += 26;
  if (newBalance != null) {
    doc.setTextColor(...META); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text("New balance if approved", lm, y); doc.setTextColor(...INK); rt(money(newBalance), rm, y); y += 24;
  }

  // Footer
  doc.setTextColor(...META); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("This change order adds the work above to your project. Approve and sign from your add-on approval email.", lm, 744);

  return Buffer.from(doc.output("arraybuffer"));
}
