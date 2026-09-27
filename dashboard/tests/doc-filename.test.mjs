// Canonical document filenames (node --test): identity by property type, service labels, last-4 of the
// project, every document type, drafts, sanitizing, long names, legacy ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DOC, projectFileBase, documentFilename, projectLast4, projectFileIdentityName, projectFileServiceLabel } from "../lib/doc-filename.js";

const res = { access_id: "ASC0038", property_type: "residential", contact_name: "Maribel Santos", customer: "Maribel Santos", service_code: "SC" };
const com = { access_id: "ASC0046", property_type: "commercial", company_name: "Buck N Up Store", contact_name: "Zain Farooq", customer: "Buck N Up Store", service_code: "AU" };
const name = (p, o) => documentFilename(projectFileBase(p), o);

test("identity: residential → full name, commercial → business, commercial without a company → contact", () => {
  assert.equal(projectFileIdentityName(res), "Maribel Santos");
  assert.equal(projectFileIdentityName(com), "Buck N Up Store");
  assert.equal(projectFileIdentityName({ ...com, company_name: null }), "Zain Farooq");
  assert.equal(projectFileIdentityName({ property_type: "commercial", company_name: "No Company", contact_name: "Ahmed" }), "Ahmed");
  assert.equal(projectFileIdentityName({ property_type: "residential", customer: "Ahmed" }), "Ahmed", "first name only when that is all there is");
  assert.equal(projectFileIdentityName({}), "Client");
});

test("service labels come from the canonical code; a priced multi-service proposal reads Low Voltage Systems", () => {
  const codes = { SC: "CCTV", ST: "CCTV", AU: "Sound System", SS: "Sound System", NW: "Network", TP: "Toast POS", AS: "Alarm System", AC: "Access Control", WX: "Low Voltage Wiring", CX: "Custom System", ADT: "ADT" };
  for (const [code, label] of Object.entries(codes)) assert.equal(projectFileServiceLabel({ service_code: code }), label, code);
  assert.equal(projectFileServiceLabel({ service_code: "CX", custom_service: "Gate Access" }), "Gate Access");
  assert.equal(projectFileServiceLabel({ service_code: "SC" }, { proposalServiceKeys: ["camera", "sound"] }), "Low Voltage Systems");
  assert.equal(projectFileServiceLabel({ service_code: "SC" }, { proposalServiceKeys: ["camera"] }), "CCTV");
});

test("project last four keeps leading zeros; legacy ids fall back to their last four characters", () => {
  assert.equal(projectLast4("ASC0046"), "0046");
  assert.equal(projectLast4("ASC1037"), "1037");
  assert.equal(projectLast4("CSC00SY"), "00SY");
  assert.equal(projectLast4("svc-0032"), "0032");
  assert.equal(projectLast4(""), "0000");
});

test("every document type in the standard shape", () => {
  assert.equal(name(res, { type: DOC.PROPOSAL, revision: 1 }), "Maribel Santos - CCTV - 0038 - v1.pdf");
  assert.equal(name(res, { type: DOC.DETAILED_PROPOSAL, revision: 1 }), "Maribel Santos - CCTV - 0038 - v1 - Detailed.pdf");
  assert.equal(name(res, { type: DOC.SITE_SURVEY }), "Maribel Santos - CCTV - 0038 - Site Survey.pdf");
  assert.equal(name(res, { type: DOC.WORK_ORDER }), "Maribel Santos - CCTV - 0038 - Work Order.pdf");
  assert.equal(name(res, { type: DOC.COMPLETION }), "Maribel Santos - CCTV - 0038 - Completion Certificate.pdf");
  assert.equal(name(com, { type: DOC.PROPOSAL, revision: "v4" }), "Buck N Up Store - Sound System - 0046 - v4.pdf");
  assert.equal(name(com, { type: DOC.DETAILED_PROPOSAL, revision: 4 }), "Buck N Up Store - Sound System - 0046 - v4 - Detailed.pdf");
  assert.equal(name(com, { type: DOC.WORK_ORDER }), "Buck N Up Store - Sound System - 0046 - Work Order.pdf");
  const cc = { access_id: "ASC0087", property_type: "commercial", company_name: "Crazy Cars", service_code: "SC" };
  assert.equal(name(cc, { type: DOC.ADDENDUM, addendum: 2 }), "Crazy Cars - CCTV - 0087 - Addendum 2.pdf");
  assert.equal(name(cc, { type: DOC.ADDENDUM, addendum: 2, revision: 1 }), "Crazy Cars - CCTV - 0087 - Addendum 2 - v1.pdf");
  assert.equal(name(cc, { type: DOC.INVOICE, invoiceNo: "INV-0187" }), "Crazy Cars - CCTV - 0087 - INV-0187.pdf");
  assert.equal(name(cc, { type: DOC.INVOICE }), "Crazy Cars - CCTV - 0087 - Invoice.pdf");
  assert.equal(name(cc, { type: DOC.SERVICE_CALL, serviceCallId: "SVC0032" }), "Crazy Cars - CCTV - 0087 - Service Call 0032.pdf");
  assert.equal(name(cc, { type: DOC.DIAGNOSTIC, serviceCallId: "SVC0032" }), "Crazy Cars - CCTV - 0087 - Service Call 0032 - Diagnostic.pdf");
  assert.equal(name(cc, { type: DOC.ESTIMATE, serviceCallId: "SVC0032" }), "Crazy Cars - CCTV - 0087 - Service Call 0032 - Estimate.pdf");
  assert.equal(name(cc, { type: DOC.DIAGNOSTIC }), "Crazy Cars - CCTV - 0087 - Diagnostic Report.pdf");
  assert.equal(name(cc, { type: DOC.CLOSEOUT }), "Crazy Cars - CCTV - 0087 - Closeout.pdf");
  assert.equal(name(cc, { type: DOC.WARRANTY }), "Crazy Cars - CCTV - 0087 - Warranty.pdf");
  assert.equal(name(cc, { type: DOC.SYSTEM_QR }), "Crazy Cars - CCTV - 0087 - System QR.png");
  assert.equal(documentFilename({ identity: "John Smith", service: "CCTV" }, { type: DOC.SERVICE_CALL, serviceCallId: "SVC0048", noProject: true }), "John Smith - CCTV - Service Call 0048.pdf");
  assert.equal(name(cc, { type: DOC.PROPOSAL, revision: 3, draft: true }), "Crazy Cars - CCTV - 0087 - v3 - Draft.pdf");
  assert.equal(name(cc, { type: DOC.PROPOSAL }), "Crazy Cars - CCTV - 0087.pdf", "no revision → no v0");
});

test("sanitizing: illegal characters go, apostrophes and hyphens stay, whitespace normalizes, long names shorten cleanly", () => {
  const p = { access_id: "ASC0151", property_type: "commercial", company_name: "  Nature's   Grill / Bar: \"West\"  ", service_code: "TP" };
  assert.equal(name(p, { type: DOC.PROPOSAL, revision: 2 }), "Nature's Grill Bar West - Toast POS - 0151 - v2.pdf");
  const long = { access_id: "ASC0188", property_type: "commercial", company_name: "Brain Foods International Holdings and Distribution Company of New Jersey LLC", service_code: "WX" };
  const f = name(long, { type: DOC.PROPOSAL, revision: 1 });
  assert.ok(f.endsWith(" - Low Voltage Wiring - 0188 - v1.pdf"), "service/id/type are never truncated");
  assert.ok(f.split(" - ")[0].length <= 40 && !f.startsWith("Brain Foods International Holdings and Distribution"));
  assert.ok(!/\s{2,}|_|IOT|\(\d\)/.test(f));
});
