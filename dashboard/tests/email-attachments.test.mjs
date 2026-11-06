// Customer emails: office BCC (admin + Maya), PDF attachments generated at send time, and the signed-
// contract alert (amount + signed PDF). Source-level assertions — lib/email.js uses Next's extensionless
// imports, so it isn't importable under bare Node; this verifies the wiring the harness exercises live.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const email = readFileSync(new URL("../lib/email.js", import.meta.url), "utf8");

test("sendEmail carries bcc + attachments to Resend and echoes them when email is off", () => {
  assert.ok(email.includes("export async function sendEmail({ to, subject, html, text, replyTo, attachments, bcc })"), "sendEmail takes bcc");
  assert.ok(email.includes("...(bccList.length ? { bcc: bccList } : {})"), "bcc goes into the Resend body");
  assert.ok(email.includes("return { skipped: true, to: recipient, bcc: bccList, subject, attachments: attNames }"), "the no-op preview echoes to/bcc/attachments for localhost verification");
  assert.ok(email.includes('e.toLowerCase() !== recipient.toLowerCase()'), "never bcc the customer themselves");
});

test("every customer email is BCC'd to the office (admin + Maya) and skips demo projects", () => {
  assert.ok(email.includes('const MAYA_EMAIL = "maya@iot-techs.com"'), "Maya is a copy target");
  assert.ok(email.includes("async function customerCopyBcc") && email.includes("[...admins, MAYA_EMAIL]"), "bcc = admin(s) + Maya");
  assert.ok(email.includes("export function isDemoProject") && email.includes('p.source === "journey-test"'), "demo guard");
  assert.ok(email.includes("if (isDemoProject(c.project)) return { skipped: \"demo-project\" };"), "sendCustomerEmail skips demo/test");
  assert.ok(email.includes("bcc: await customerCopyBcc(c.email)"), "sendCustomerEmail auto-BCCs");
  assert.ok(/@journey-test\\\.local\$\/i\.test\(e\)/.test(email) || email.includes("!/@journey-test\\.local$/i.test(e)"), "office recipients never include a demo/test address");
});

test("attachment names are brand-prefixed: IOT TECHS Proposal - <Customer> - <Proposal #>.pdf", () => {
  assert.ok(email.includes("function attachmentName") && email.includes("`IOT TECHS ${kind}"), "brand-prefixed filename");
  assert.ok(email.includes('proposalDocNo') && email.includes('`PROP-${String(row.id).padStart(4, "0")}-v${row.version'), "proposal # format");
});

test("proposal PDF is generated server-side at send time (latest version) and attached", () => {
  assert.ok(email.includes("async function proposalPdfAttachment") && email.includes("buildProposalUnsigned"), "renders the customer-sanitized proposal PDF server-side");
  assert.ok(email.includes("const att = await proposalPdfAttachment(accessId, optKey)") && email.includes("const att = await proposalPdfAttachment(accessId)"), "signature-request + proposal-ready attach it");
  assert.ok(/emailSignatureRequest[\s\S]*attachments: att \? \[att\] : undefined/.test(email), "signature request attaches the proposal");
});

test("signed-contract alert → admin + Maya, with the amount and the signed PDF, never scheduled", () => {
  assert.ok(email.includes("async function signedPdfAttachment") && email.includes("row.signed_doc_id") && email.includes("getDocument"), "pulls the stored signed PDF");
  assert.ok(/emailContractSigned[\s\S]*await adminNotifyRecipients\(\)\), MAYA_EMAIL/.test(email), "recipients = admin(s) + Maya");
  assert.ok(/emailContractSigned[\s\S]*getProjectFinancialState[\s\S]*signed proposal\$\{money/.test(email), "subject carries the signed amount");
  assert.ok(/emailContractSigned[\s\S]*const att = await signedPdfAttachment\(accessId\)/.test(email), "attaches the signed PDF");
});

test("the other customer sends (review, add-on, ADT, appointment) also BCC the office", () => {
  assert.ok(email.includes('bcc: await customerCopyBcc(to) });') , "review + add-on sends BCC");
  assert.ok(email.includes("bcc: await customerCopyBcc(app.email)"), "ADT quote BCCs");
  assert.ok(email.includes("bcc: isStaff ? undefined : await customerCopyBcc(r.email)"), "appointment customer leg BCCs (staff legs don't)");
  assert.ok(email.includes('if (isDemoProject(p)) return { ok: true, skipped: "demo-project", sent: 0 };'), "appointments skip demo projects");
});
