// The DOWNLOADABLE proposal PDF must carry a REAL, cross-viewer-fillable AcroForm in the acceptance
// block — standard text fields with complete default appearances, so the customer can fill Client Name /
// Date / Signature in Acrobat, Preview or iOS (not only Chrome), offline, with no website. These tests
// assert the embedded form, not a screenshot. See lib/proposal-acroform.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFillableProposalBytes } from "../lib/proposal-acroform.js";
import { PDFDocument } from "pdf-lib";

function proposal(extra = {}) {
  return {
    version: 3, status: "sent", created_by_name: "La Vague",
    payload: {
      options: [{ id: "A", name: "Premium", services: [{ key: "camera", label: "Security Cameras",
        items: [{ id: "nvr", name: "NVR", qty: 1, price: 150 }, { id: "cam", name: "Camera", qty: 4, price: 300 }] }] }],
      payment_plan: "50_50", discount: { type: "flat", value: 0 },
    },
    ...extra,
  };
}
const META = { customerName: "Nobo Restaurant", projectId: "ASC0050", fileBase: { identity: "Nobo Restaurant", service: "CCTV", last4: "0050" } };

test("the downloadable proposal embeds the three acceptance fields with the expected names/types/required", async () => {
  const { bytes, fileName } = await buildFillableProposalBytes(proposal(), META, {});
  assert.ok(fileName && /\.pdf$/i.test(fileName), "has a .pdf filename");
  const form = (await PDFDocument.load(bytes)).getForm();
  const byName = Object.fromEntries(form.getFields().map((f) => [f.getName(), f]));
  for (const n of ["proposal_client_name", "proposal_signature_date", "proposal_authorized_signature"]) {
    assert.ok(byName[n], `field ${n} present`);
    assert.equal(byName[n].constructor.name, "PDFTextField", `${n} is a text field`);
  }
  // Client Name + Date are required; the signature is optional (markup/Fill-&-Sign may be used instead).
  assert.equal(byName.proposal_client_name.isRequired(), true, "client name required");
  assert.equal(byName.proposal_signature_date.isRequired(), true, "date required");
  assert.equal(byName.proposal_authorized_signature.isRequired(), false, "signature not required");
});

test("each field has a widget on a page with a non-empty rectangle (placed over the acceptance box)", async () => {
  const { bytes } = await buildFillableProposalBytes(proposal(), META, {});
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const pageRefs = pdf.getPages().map((p) => p.ref);
  for (const name of ["proposal_client_name", "proposal_signature_date", "proposal_authorized_signature"]) {
    const widgets = form.getField(name).acroField.getWidgets();
    assert.equal(widgets.length, 1, `${name} has one widget`);
    const r = widgets[0].getRectangle();
    assert.ok(r.width > 10 && r.height > 5, `${name} rect has real size`);
    const onPage = widgets[0].P();   // the page the widget is attached to
    assert.ok(pageRefs.some((ref) => ref === onPage), `${name} widget is attached to a page`);
  }
});

test("the AcroForm is complete for strict viewers: /DA, /DR Helvetica, per-field /DA + /AP, NeedAppearances", async () => {
  const { bytes } = await buildFillableProposalBytes(proposal(), META, {});
  const s = Buffer.from(bytes).toString("latin1");
  assert.match(s, /\/NeedAppearances\s+true/, "NeedAppearances set");
  assert.match(s, /\/DR\s*<<[\s\S]*?\/Helvetica/, "form /DR defines Helvetica");
  assert.ok((s.match(/\/DA\s*\(/g) || []).length >= 3, "each field carries a /DA");
  assert.ok((s.match(/\/Subtype\s*\/Widget/g) || []).length >= 3, "three widgets");
  assert.ok((s.match(/\/AP\s*<</g) || []).length >= 3, "each field carries an appearance stream");
  // Pricing stays immutable — no field named for money/total.
  assert.doesNotMatch(s, /\/T\s*[(<][^)>]*(total|price|grand|amount)/i, "no fillable pricing field");
});

test("a signed/accepted proposal downloads with NO fillable fields (the signature is stamped, not a form)", async () => {
  const signed = proposal({ signed_at: "2026-10-09T12:00:00Z", signed_name: "Jane Customer", accepted_options: ["A"], signedPayload: proposal().payload });
  const { bytes } = await buildFillableProposalBytes(signed, META, {});
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getFields().length, 0, "signed proposal has no AcroForm fields");
});
