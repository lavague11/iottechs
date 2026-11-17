// B4 — one "A" scheme for a change order: the row in the portal, the download, and the emailed file
// all say the same thing. Before this, the UI said "A1" while a download said "Addendum 1".
//
// Worth recording about the original B4 report: it measured `documentFilename({ type: DOC.ADDENDUM })`,
// which at the time had NO production caller — the only addendum file anyone actually receives is the
// email attachment, which is named by `attachmentName` (a deliberate branded scheme, lib/email.js:205).
// So the "3 of 3 filenames change" figure described a code path nobody used. The real defect was the
// email attachment having no A-number at all: two change orders on one project produced one filename.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addendumLabel, addendumNumberLabel, addendumRowText } from "../lib/addendum-display.js";
import { DOC, documentFilename, projectFileBase } from "../lib/doc-filename.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the A-scheme has exactly one definition, by index and by number", () => {
  assert.equal(addendumNumberLabel(1), "A1");
  assert.equal(addendumNumberLabel(2), "A2");
  assert.equal(addendumLabel(0), "A1", "index 0 is the first add-on");
  assert.equal(addendumLabel(1), "A2");
  // the index form is defined in terms of the number form, so they can never drift
  for (let i = 0; i < 5; i++) assert.equal(addendumLabel(i), addendumNumberLabel(i + 1));
  // junk degrades to the first one rather than "ANaN"
  assert.equal(addendumNumberLabel(undefined), "A1");
  assert.equal(addendumLabel("x"), "A1");
});

test("a download is named with the same label the portal row shows", () => {
  const p = { access_id: "ASC0087", property_type: "commercial", company_name: "Crazy Cars", service_code: "SC" };
  const base = projectFileBase(p);
  assert.equal(documentFilename(base, { type: DOC.ADDENDUM, addendum: 2 }), "Crazy Cars - CCTV - 0087 - A2.pdf");
  assert.equal(documentFilename(base, { type: DOC.ADDENDUM, addendum: 2, revision: 1 }), "Crazy Cars - CCTV - 0087 - A2 - v1.pdf");
  // the row the customer reads for that same add-on carries the identical label
  assert.ok(addendumRowText({ status: "approved", signedAt: "2026-07-09T08:47:48.167Z" }, 1).startsWith("A2 · "));
  // and the filename segment is not hand-built — it comes from the shared helper
  assert.ok(read("../lib/doc-filename.js").includes("addendumNumberLabel(addendum)"), "doc-filename uses the shared label");
  assert.ok(!/`Addendum \$\{/.test(read("../lib/doc-filename.js")), "no hand-rolled 'Addendum N' string left");
});

test("an unnumbered add-on keeps the readable word", () => {
  const base = projectFileBase({ access_id: "ASC0087", property_type: "commercial", company_name: "Crazy Cars", service_code: "SC" });
  assert.equal(documentFilename(base, { type: DOC.ADDENDUM }), "Crazy Cars - CCTV - 0087 - Addendum.pdf",
    "a bare 'A' would be meaningless in a download folder");
});

test("the emailed change order carries its A-number, so two on one project can't collide", () => {
  const email = read("../lib/email.js");
  assert.match(email, /docNo: `\$\{accessId\} - \$\{addendumLabel\(addIdx\)\}`/, "the attachment name includes the label");
  assert.match(email, /addIdx = list\.findIndex/, "the index comes from the stored array, like the UI's");
  // the branded email scheme itself is deliberate and stays (lib/email.js documents why)
  assert.ok(email.includes("Email attachments carry the brand on purpose"), "the brand exception is still recorded");
});
