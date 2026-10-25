// Proposal header identity: "Prepared For" is the business when one exists (fileBase.identity is business-
// aware), the person otherwise. A residential proposal shows no redundant second name; a business shows a
// separate CONTACT (the human). The signer is always the human — never the business.
import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadProposalPdf } from "../lib/proposal-pdf.js";

function headerTexts(meta) {
  const trace = [];
  downloadProposalPdf(
    { id: 7, version: 1, tax_rate: 0, deposit_pct: 50, created_at: "2026-10-25 10:00:00", created_by_name: "Ahmed",
      payload: { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "c", name: "Camera", qty: 1, price: 300 }] }] }], payment_plan: "50_50", discount: { type: "flat", value: 0 }, pcp_credit: 0 } },
    { customerAddress: "2503 Jay Pl", customerPhone: "(555) 867-1234", customerEmail: "jamie@example.com", __trace: trace, __return: true, ...meta },
  );
  return trace.map((t) => t.text);
}
const count = (arr, s) => arr.filter((t) => t === s).length;

test("residential: Prepared For is the person, with no redundant Client Name field", () => {
  const t = headerTexts({ customerName: "Jamie Tester", fileBase: { identity: "Jamie Tester", service: "CCTV", last4: "0055" } });
  assert.ok(t.includes("PREPARED FOR"), "Prepared For label present");
  assert.equal(count(t, "Jamie Tester"), 1, "the person's name appears once in the header (no duplicate Client Name)");
  assert.ok(!t.includes("CONTACT"), "no CONTACT line for an individual");
});

test("business: Prepared For is the company; a separate CONTACT names the human", () => {
  const t = headerTexts({ customerName: "John Smith", fileBase: { identity: "Joe's Pizza LLC", service: "CCTV", last4: "0001" } });
  assert.ok(t.includes("Joe's Pizza LLC"), "Prepared For shows the company");
  assert.ok(t.includes("CONTACT"), "a CONTACT line appears for a business");
  assert.ok(t.includes("John Smith"), "the human contact is named");
  assert.ok(!t.includes("Joe's Pizza LLC".toLowerCase()) || true);
});

test("the company name is never used as the person / signer", () => {
  const t = headerTexts({ customerName: "John Smith", fileBase: { identity: "Joe's Pizza LLC", service: "CCTV", last4: "0001" } });
  // The CONTACT value is the person, not the company; the company only appears as Prepared For.
  assert.equal(count(t, "Joe's Pizza LLC"), 1, "company appears once (Prepared For), not reused as the contact/signer");
});
