// The add-on (change order) rendered in the PROPOSAL's design — Stage 2 item 2 of docs/customer-flow-v2.md.
//
// There is no second renderer here. An add-on is shaped into the proposal payload the real renderer already
// speaks and handed to `downloadProposalPdf`, exactly as lib/esign/proposal-source.js does for a proposal,
// so the two documents cannot drift apart in layout, header, typography or totals.
//
// The money is the point of care. `optionTotals` (what the renderer prints) and `addendumTotals` (what the
// app, the email and the balance use) are separate functions, so this module's job is to feed the renderer
// inputs that make them agree to the cent — the discount as a FLAT amount (an add-on's discount is dollars,
// never a percentage), the add-on's own tax rate, and the add-on's own PCP credit. `addendumPdfTotals()`
// exposes the comparison so a test can hold the two formulas together rather than trusting that they match.
//
// Customer-facing only: `addendumItemsToServices` emits `techPrice` per line, but the proposal renderer
// prints retail (`price`) and never a payout, which is the same rule the old change-order PDF followed.
import { downloadProposalPdf } from "./proposal-pdf.js";
import { addendumItemsToServices } from "./addendum-items.js";
import { addendumTotals, optionTotals, serviceLabel } from "./proposal.js";
import { projectFileBase, DOC } from "./doc-filename.js";

// An add-on's discount is a dollar figure; its PCP credit is the proposal's {type,value} shape (or absent).
const discountOf = (add) => ({ type: "flat", value: +add?.discount || 0 });
const pcpOf = (add) => (add?.pcpCredit == null || add?.pcpCredit === "" ? { type: "flat", value: 0 } : add.pcpCredit);

// The add-on as ONE proposal option. Services come back in the add-on's own grouping, each line flat.
export function addendumAsOption(add = {}) {
  const services = addendumItemsToServices(add.items || []);
  return {
    id: "A",
    name: add.title || "Change order",
    services: services.length ? services : [{ key: "custom", label: serviceLabel("custom"), items: [], note: "" }],
  };
}

// The proposal-shaped record the renderer wants. Never signed and never accepted: the signature state of
// an add-on lives on the add-on record, and passing one here would make the renderer draw a signature block
// bound to a proposal that does not exist.
export function addendumAsProposal(add = {}, { projectId = "" } = {}) {
  return {
    id: 0,
    version: 1,
    status: "sent",
    tax_rate: +add.taxRate || 0,
    deposit_pct: 0,                       // an add-on carries no deposit of its own (see the build notes)
    created_at: add.at || null,
    sent_at: add.at || null,
    signed_name: null, signed_at: null, signature_data: null, signedPayload: null,
    accepted_options: [], declined_options: {},
    payload: {
      options: [addendumAsOption(add)],
      discount: discountOf(add),
      pcp_credit: pcpOf(add),
      // No payment plan on an add-on: it folds into the contract total and the PROPOSAL's plan re-splits
      // over the updated total (spec items 3 and 4). A plan here would print a second, competing schedule.
      payment_plan: null,
      projectId,
    },
  };
}

// What the renderer will print vs. what the app charges. Equal is the invariant; a test asserts it.
export function addendumPdfTotals(add = {}) {
  const p = addendumAsProposal(add);
  const rendered = optionTotals(p.payload.options[0], p.tax_rate, p.payload.discount, 0, p.payload.pcp_credit);
  const charged = addendumTotals(add);
  return { rendered, charged, agree: rendered.grand === charged.total };
}

// Bytes for the change-order PDF, in the proposal's design. `meta.customerName` is the human contact.
export function buildAddendumProposalPdf(add = {}, { customerName = "", projectId = "", project = null, mode = "standard" } = {}) {
  const p = addendumAsProposal(add, { projectId });
  const meta = {
    customerName,
    customerAddress: project?.address || "",
    customerPhone: project?.contact_phone || "",
    customerEmail: project?.contact_email || "",
    fileBase: projectFileBase(project || { access_id: projectId }),
    projectId,
    mode,
    // The header band reads CHANGE ORDER rather than SYSTEM PROPOSAL — same document, different instrument.
    __docLabel: "CHANGE ORDER",
    __docType: DOC.ADDENDUM,    // named as an Addendum, by lib/doc-filename.js
    __return: true,
  };
  const doc = downloadProposalPdf(p, meta, {});
  return { bytes: Buffer.from(doc.output("arraybuffer")), pageCount: doc.getNumberOfPages(), fileName: doc.__fileName };
}
