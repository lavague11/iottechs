// ONE canonical filename generator for every document the app downloads, exports or attaches.
//   [Identity] - [Service] - [Last 4 of project] - [Document]            e.g.
//   Buck N Up Store - Sound System - 0046 - v4.pdf                       (standard proposal)
//   Buck N Up Store - Sound System - 0046 - v4 - Detailed.pdf            (detailed proposal)
//   Maribel Santos - CCTV - 0038 - Work Order.pdf
//   Crazy Cars - CCTV - 0087 - Service Call 0032 - Diagnostic.pdf
// Identity: the business name on commercial projects, the contact's full name otherwise. No brand text,
// no underscores, no ASC prefix, no browser-style copy numbers. Same document + version → same name.
import { SERVICE_CATALOG, normalizePropertyType } from "./spec.js";

export const DOC = Object.freeze({
  PROPOSAL: "proposal", DETAILED_PROPOSAL: "detailed", SITE_SURVEY: "survey", WORK_ORDER: "work_order",
  ADDENDUM: "addendum", INVOICE: "invoice", COMPLETION: "completion", CLOSEOUT: "closeout", WARRANTY: "warranty",
  SERVICE_CALL: "service_call", DIAGNOSTIC: "diagnostic", ESTIMATE: "estimate", SYSTEM_QR: "system_qr",
});
const DOC_LABEL = {
  [DOC.PROPOSAL]: "", [DOC.DETAILED_PROPOSAL]: "Detailed", [DOC.SITE_SURVEY]: "Site Survey", [DOC.WORK_ORDER]: "Work Order",
  [DOC.ADDENDUM]: "Addendum", [DOC.INVOICE]: "Invoice", [DOC.COMPLETION]: "Completion Certificate", [DOC.CLOSEOUT]: "Closeout",
  [DOC.WARRANTY]: "Warranty", [DOC.SERVICE_CALL]: "Service Call", [DOC.DIAGNOSTIC]: "Diagnostic Report", [DOC.ESTIMATE]: "Estimate",
  [DOC.SYSTEM_QR]: "System QR",
};
const DOC_EXT = { [DOC.SYSTEM_QR]: "png" };

// Customer-facing service label per canonical service code (projects.service_code) — one map.
export const FILENAME_SERVICE_LABEL = Object.freeze({
  SC: "CCTV", ST: "CCTV", AU: "Sound System", SS: "Sound System", NW: "Network", TP: "Toast POS", AS: "Alarm System",
  AC: "Access Control", WX: "Low Voltage Wiring", CX: "Custom System", MX: "Low Voltage Systems", ADT: "ADT",
});
export const MULTI_SERVICE_LABEL = "Low Voltage Systems";
// Proposal service keys (payload.services[].key) → the same labels, for the multi-service check.
const PROPOSAL_KEY_LABEL = { camera: "CCTV", sound: "Sound System", toast: "Toast POS", alarm: "Alarm System", access: "Access Control", wiring: "Low Voltage Wiring", custom: "Custom System" };

const clean = (s) => String(s ?? "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
const MAX_IDENTITY = 40;
function shorten(name) {
  if (name.length <= MAX_IDENTITY) return name;
  const cut = name.slice(0, MAX_IDENTITY + 1);
  const at = cut.lastIndexOf(" ");
  return (at > 12 ? cut.slice(0, at) : name.slice(0, MAX_IDENTITY)).trim();
}

// Who the file is for: the business on a commercial project, else the contact's full name.
export function projectFileIdentityName(project = {}) {
  const commercial = normalizePropertyType(project.property_type || project.propertyType) === "commercial";
  const company = clean(project.company_name || project.company);
  const contact = clean(project.contact_name || project.contactName);
  const label = clean(project.customer || project.customerName);
  const pick = (commercial && company) || contact || company || label || "Client";
  return shorten(pick.replace(/^(null|undefined|no company)$/i, "") || contact || label || "Client");
}

// Last four of the project number: ASC0046 → 0046 (leading zeros kept); any other id → its last four
// alphanumerics, digits preferred. Never throws.
export function projectLast4(accessId) {
  const id = String(accessId || "").trim();
  const m = /(\d{4})$/.exec(id);
  if (m) return m[1];
  const alnum = id.replace(/[^a-z0-9]/gi, "");
  return alnum.slice(-4).toUpperCase() || "0000";
}

// Service word: the project's canonical service code, or "Low Voltage Systems" when the priced proposal
// spans more than one major service; a custom service keeps a meaningful name when the project has one.
export function projectFileServiceLabel(project = {}, { proposalServiceKeys = null } = {}) {
  const keys = [...new Set((proposalServiceKeys || []).filter(Boolean))];
  if (keys.length > 1) return MULTI_SERVICE_LABEL;
  const code = String(project.service_code || project.serviceCode || "").toUpperCase();
  if (code === "CX" || code === "MX") {
    const custom = clean(project.custom_service || project.service_label || project.service_name);
    if (custom && !/^(custom|mixed|other)$/i.test(custom)) return shorten(custom);
  }
  if (FILENAME_SERVICE_LABEL[code]) return FILENAME_SERVICE_LABEL[code];
  if (keys.length === 1 && PROPOSAL_KEY_LABEL[keys[0]]) return PROPOSAL_KEY_LABEL[keys[0]];
  const cat = SERVICE_CATALOG.find((s) => s.code === code);
  return cat ? FILENAME_SERVICE_LABEL[cat.code] || cat.label : "Custom System";
}

// The reusable base for one project: { identity, service, last4 } — computed once where the project row
// is known, then handed to any renderer.
export function projectFileBase(project = {}, opts = {}) {
  return { identity: projectFileIdentityName(project), service: projectFileServiceLabel(project, opts), last4: projectLast4(project.access_id || project.accessId) };
}

// The filename. `base` from projectFileBase (or { identity, service, last4 }); `type` from DOC.
//   revision       proposal version → "v4" (proposal-based documents only)
//   draft          appends "Draft" for an intentionally exported draft
//   addendum       addendum number (Addendum 2), with optional revision (Addendum 2 - v1)
//   invoiceNo      canonical invoice id (INV-0187) preferred over "Invoice"
//   serviceCallId  SVC id → "Service Call 0032" (+ " - Diagnostic" / " - Estimate" for those types)
//   noProject      service call not linked to a project → no project last-4
export function documentFilename(base, { type = DOC.PROPOSAL, revision = null, draft = false, addendum = null, invoiceNo = null, serviceCallId = null, noProject = false, ext = null } = {}) {
  const parts = [clean(base?.identity) || "Client", clean(base?.service) || "Custom System"];
  if (!noProject) parts.push(clean(base?.last4) || "0000");
  const rev = revision != null && revision !== "" ? `v${String(revision).replace(/^v/i, "")}` : null;
  const svc = serviceCallId ? `Service Call ${projectLast4(serviceCallId)}` : null;
  switch (type) {
    case DOC.PROPOSAL: if (rev) parts.push(rev); break;
    case DOC.DETAILED_PROPOSAL: if (rev) parts.push(rev); parts.push("Detailed"); break;
    case DOC.SITE_SURVEY: if (rev) parts.push(rev); parts.push("Site Survey"); break;
    case DOC.ADDENDUM: parts.push(addendum != null ? `Addendum ${addendum}` : "Addendum"); if (rev) parts.push(rev); break;
    case DOC.INVOICE: parts.push(clean(invoiceNo) || "Invoice"); break;
    case DOC.SERVICE_CALL: parts.push(svc || "Service Call"); break;
    case DOC.DIAGNOSTIC: parts.push(svc ? `${svc} - Diagnostic` : "Diagnostic Report"); break;
    case DOC.ESTIMATE: parts.push(svc ? `${svc} - Estimate` : "Estimate"); break;
    default: parts.push(DOC_LABEL[type] || clean(type));
  }
  if (draft) parts.push("Draft");
  return `${parts.filter(Boolean).join(" - ")}.${ext || DOC_EXT[type] || "pdf"}`;
}
