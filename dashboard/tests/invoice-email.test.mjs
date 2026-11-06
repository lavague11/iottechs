// Customer invoice email: Send now / Schedule (8:30) flow, invoice PDF + Pay button, office BCC, demo
// guard, and automatic reminders 3 days before due + on the due date if unpaid. Source-level for the
// email/action wiring (extensionless imports), functional for the PDF generator (pure jsPDF).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const email = read("../lib/email.js");
const sweep = read("../lib/invoice-emails.js");
const actions = read("../app/project/[accessId]/proposal-actions.js");

test("the invoice PDF renders server-side with a due date", async () => {
  const { downloadInvoicePdf } = await import("../lib/invoice-pdf.js");
  const doc = downloadInvoicePdf({ customerName: "Test Co", projectId: "ASC0001", invoiceNo: "INV-0001-v1", dueDate: "2026-11-20", __return: true },
    { lines: [{ label: "Security System", amount: 2400 }], grandWithAddons: 2400, paidTotal: 500, balance: 1900 }, []);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  assert.ok(bytes.slice(0, 5).toString() === "%PDF-" && bytes.length > 1000, "invoice is a real PDF");
  assert.ok(email.includes("async function invoicePdfAttachment") && email.includes("buildInvoicePdfBytes"), "the email attaches the server-rendered invoice");
});

test("emailInvoice sends the PDF + a Pay button, BCCs the office, skips demo", () => {
  assert.ok(email.includes("export async function emailInvoice"), "emailInvoice exists");
  assert.ok(email.includes('ctaLabel: "Pay Invoice"') && email.includes('open: "payment"'), "a Pay button links to the payment page");
  assert.ok(email.includes("return await sendCustomerEmail(accessId, {"), "goes through sendCustomerEmail — auto-BCC (admin + Maya) + demo guard");
  assert.ok(/reminder === "due"/.test(email) && /reminder === "pre"/.test(email), "reminder copy variants (3-days-before + due-today)");
});

test("invoice actions: send now / schedule (8:30) / cancel, admin-manager only", () => {
  for (const n of ["sendInvoiceAction", "scheduleInvoiceEmailAction", "cancelInvoiceScheduleAction", "getInvoiceScheduleAction"])
    assert.ok(actions.includes(`export async function ${n}`), `${n} exists`);
  assert.ok(actions.includes('const INV_STAFF = new Set(["admin", "manager"])') && actions.includes("!INV_STAFF.has(tok.role)"), "admin/manager only");
  assert.ok(actions.includes("defaultDueDate()") && actions.includes('saveToolData(accessId, "invoice"'), "Net-14 due date stored in the invoice blob");
  assert.ok(actions.includes("logProjectEvent"), "everything is logged");
});

test("the sweep sends scheduled invoices + reminders, only while unpaid", () => {
  assert.ok(sweep.includes("export async function sendDueInvoiceEmails"), "sweep exists");
  assert.ok(sweep.includes("inv.scheduledSendAt && !inv.sentAt") && sweep.includes("when <= now"), "sends a due scheduled invoice");
  assert.ok(sweep.includes("balance > 0"), "reminders only while unpaid");
  assert.ok(sweep.includes("now >= due - 3 * DAY && now < due") && sweep.includes("remind3SentAt"), "reminder 3 days before due (once)");
  assert.ok(sweep.includes("now >= due") && sweep.includes("remindDueSentAt"), "reminder on the due date (once)");
  assert.ok(read("../instrumentation.js").includes("sendDueInvoiceEmails") && read("../app/api/cron/invoice-emails/route.js").includes("sendDueInvoiceEmails"), "boot sweep + cron wired");
});

test("the card menu offers Send invoice via the shared scheduler", () => {
  const m = read("../app/components/project-card-menu.jsx");
  assert.ok(m.includes("Send invoice") && m.includes("import SendScheduler"), "menu item opens the Send now / Schedule chooser");
  assert.ok(m.includes("sendInvoiceAction") && m.includes("scheduleInvoiceEmailAction"), "wired to the invoice actions");
});
