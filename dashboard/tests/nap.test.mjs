// The company's contact details come from ONE place (lib/nap.js), and the Zelle payment token is
// never published as a phone number.
//
// Why this test exists: `(646) 396-0775` is the Zelle handle the business receives payments on, and
// it was published as the contact number **31 times** across `lib/` and `app/` (39 occurrences before
// this change, 8 legitimate ones after) — the shared PDF chrome and so every proposal, invoices,
// receipts, change orders, completion certificates, service reports, the internal work order, the ADT
// portal, the customer tour, a help article telling customers to "call us at 646-396-0775", and five
// live tel:/sms: links whose "Call us" and "Text us" buttons dialled the payment handle. Only
// lib/email.js had the real number, in a local const of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SUPPORT_PHONE, SUPPORT_TEL, SUPPORT_EMAIL, contactLine, footerLine } from "../lib/nap.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", ".next", "tests", "docs", ".git", "public"]);
// Deliberate, documented uses of the token AS a payment handle — not as a contact number.
const ALLOWED = new Set([
  path.join("lib", "nap.js"),              // defines it, to warn about it
  path.join("lib", "seo", "schema.js"),    // documents it as the Zelle token in the NAP guidance
  path.join("app", "project", "[accessId]", "pay-zelle.jsx"),   // IS the Zelle handle — correct here
  // The PDF-extraction prompt lists the contractor's own numbers so the model never returns one as
  // the CUSTOMER. It names the canonical line first and keeps the old one for historical documents.
  path.join("app", "api", "proposal-import", "route.js"),
]);
// Every shape the number has appeared in. The hyphenated form is how two of them hid: a help article
// telling customers to "call us at 646-396-0775", and five tel:/sms: links.
const SHAPES = ["(646) 396-0775", "646-396-0775", "646 396 0775", "6463960775"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(abs);
  }
  return out;
}

test("the canonical number is the Google Business Profile one, in one module", () => {
  assert.equal(SUPPORT_PHONE, "(917) 727-0081");
  assert.equal(SUPPORT_TEL, "+19177270081");
  assert.equal(contactLine("  ·  "), "(917) 727-0081  ·  support@iot-techs.com  ·  www.iot-techs.com");
  assert.equal(footerLine("  ·  ", "Confidential"),
    "IOT TECHS  ·  (917) 727-0081  ·  support@iot-techs.com  ·  www.iot-techs.com  ·  Confidential");
  assert.equal(footerLine("  ·  "), "IOT TECHS  ·  (917) 727-0081  ·  support@iot-techs.com  ·  www.iot-techs.com");
  assert.ok(SUPPORT_EMAIL.endsWith("@iot-techs.com"));
});

test("the Zelle token is published as a phone number nowhere", () => {
  const offenders = [];
  for (const abs of [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app"))]) {
    const rel = path.relative(ROOT, abs);
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(abs, "utf8");
    if (SHAPES.some((s) => src.includes(s))) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `the Zelle payment token is being shown as a contact number in:\n  ${offenders.join("\n  ")}`);
});

test("every PDF renderer takes its contact strip from nap.js rather than a literal", () => {
  for (const f of ["proposal-pdf.js", "invoice-pdf.js", "receipt-pdf.js", "addendum-pdf.js", "completion-pdf.js", "pdf-chrome.js"]) {
    const src = readFileSync(path.join(ROOT, "lib", f), "utf8");
    assert.match(src, /from "\.\/nap\.js"/, `${f} imports the shared NAP`);
    assert.doesNotMatch(src, /support@iot-techs\.com\s+·/, `${f} still builds a contact strip by hand`);
  }
});
