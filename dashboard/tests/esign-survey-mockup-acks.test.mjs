// E-sign: the customer signs the WHOLE proposal — survey + mockup pages appended — and explicitly
// acknowledges those pages. The survey/mockup acks are gated on FACTS from the stored unsigned document
// (does it carry those pages), never on anything the client claims.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requiredAcks, missingRequired } from "../lib/esign/capture.js";
import { cleanAppendix, appendixHash } from "../lib/esign/proposal-source.js";
import { PROPOSAL_ACKS } from "../lib/proposal-terms.js";

const keys = (facts) => requiredAcks({}, facts).map((a) => a.key);
const SIG = { data: "data:image/png;base64,AAAA" };

test("PROPOSAL_ACKS carries required, gated survey + mockup acknowledgments", () => {
  const survey = PROPOSAL_ACKS.find((a) => a.key === "survey");
  const mockup = PROPOSAL_ACKS.find((a) => a.key === "mockup");
  assert.ok(survey?.required && survey.surveyOnly, "survey ack is required + surveyOnly-gated");
  assert.ok(mockup?.required && mockup.mockupOnly, "mockup ack is required + mockupOnly-gated");
});

test("requiredAcks gates survey/mockup on the document facts, not the payload", () => {
  assert.deepEqual(keys({}), ["terms", "payment", "marketing"], "no appendix → no survey/mockup ack");
  assert.ok(keys({ hasSurvey: true }).includes("survey") && !keys({ hasSurvey: true }).includes("mockup"), "survey pages → survey ack only");
  assert.ok(keys({ hasMockup: true }).includes("mockup") && !keys({ hasMockup: true }).includes("survey"), "mockup pages → mockup ack only");
  const both = keys({ hasSurvey: true, hasMockup: true });
  assert.ok(both.includes("survey") && both.includes("mockup"), "both pages → both acks");
});

test("missingRequired demands the survey/mockup acks whenever those pages are in the signed doc", () => {
  const vals = { name: "Jo", signature: SIG, acks: { terms: true, payment: true } };
  assert.deepEqual(missingRequired(vals, {}, {}), [], "no appendix → satisfied by terms+payment");
  assert.deepEqual(missingRequired(vals, {}, { hasSurvey: true, hasMockup: true }), ["ack:survey", "ack:mockup"], "appendix → survey+mockup still missing");
  const agreed = { ...vals, acks: { terms: true, payment: true, survey: true, mockup: true } };
  assert.deepEqual(missingRequired(agreed, {}, { hasSurvey: true, hasMockup: true }), [], "all four checked → satisfied");
});

test("cleanAppendix only accepts well-formed, size-bounded images and caps the page count", () => {
  const png = (n) => "data:image/png;base64," + "A".repeat(n);
  const clean = cleanAppendix({
    surveyImages: [{ name: "Floor 1", img: png(40) }, { name: "x", img: "not-an-image" }, { img: png(40) }],
    mockupImages: [png(40), png(40), "nope", 123],
  });
  assert.equal(clean.surveyImages.length, 2, "drops the non-image survey entry");
  assert.equal(clean.mockupImages.length, 2, "drops the non-string / non-image mockup entries");
  assert.ok(clean.surveyImages[0].name === "Floor 1" && clean.surveyImages[0].img.startsWith("data:image/"), "keeps name + data url");
  const over = cleanAppendix({ surveyImages: Array.from({ length: 40 }, (_, i) => ({ name: `F${i}`, img: png(40) })) });
  assert.ok(over.surveyImages.length <= 20, "caps survey pages at 20");
});

test("appendixHash is stable per content and changes when the appendix changes", () => {
  const png = (n) => "data:image/png;base64," + "A".repeat(n);
  const a = cleanAppendix({ surveyImages: [{ name: "F1", img: png(40) }] });
  const b = cleanAppendix({ surveyImages: [{ name: "F1", img: png(40) }] });
  const c = cleanAppendix({ surveyImages: [{ name: "F1", img: png(80) }] });
  assert.equal(appendixHash(a), appendixHash(b), "same content → same hash");
  assert.notEqual(appendixHash(a), appendixHash(c), "different content → different hash");
  assert.notEqual(appendixHash(a), appendixHash(cleanAppendix(null)), "appendix vs none differ");
});

test("the signing pipeline threads the appendix + facts end to end (drift)", () => {
  const src = readFileSync(new URL("../lib/esign/proposal-source.js", import.meta.url), "utf8");
  assert.ok(/buildProposalUnsigned\(accessId, optKey, row, appendix\)/.test(src), "ensureProposalUnsigned builds WITH the appendix");
  assert.ok(/appendixHash: built\.appendixHash, hasSurvey: built\.hasSurvey, hasMockup: built\.hasMockup/.test(src), "and stores the facts in the doc meta");
  assert.ok(/const apxOk = apx == null \|\| \(cur\?\.meta\?\.appendixHash \|\| EMPTY_APPENDIX_HASH\) === apx;/.test(src), "a supplied appendix is matched by hash; a null appendix reuses the current doc");

  const sess = readFileSync(new URL("../lib/esign/session.js", import.meta.url), "utf8");
  assert.ok(/appendix = null/.test(sess) && /ensureProposalUnsigned\(accessId, optKey, \{ by: caller\.role, appendix \}\)/.test(sess), "startSession forwards the appendix");

  const comp = readFileSync(new URL("../lib/esign/complete.js", import.meta.url), "utf8");
  assert.ok(/const facts = \{ hasSurvey: !!doc\.meta\?\.hasSurvey, hasMockup: !!doc\.meta\?\.hasMockup \}/.test(comp), "completion reads facts from the stored doc");
  assert.ok(/missingRequired\(values, payload, facts\)/.test(comp) && /requiredAcks\(payload, facts\)/.test(comp), "and gates the required acks + certificate list on them");

  const act = readFileSync(new URL("../app/project/[accessId]/esign-actions.js", import.meta.url), "utf8");
  assert.ok(/factsOf = \(doc\) =>/.test(act) && /ackList\(r\.row, r\.doc\)/.test(act), "views derive facts from the doc");

  // The appendix (MBs of images) rides a route handler, not the server action.
  const route = readFileSync(new URL("../app/api/esign/prepare/route.js", import.meta.url), "utf8");
  assert.ok(/maySignProposal\(caller, accessId\)/.test(route), "the prepare route re-checks the caller may sign");
  assert.ok(/ensureProposalUnsigned\(accessId, optKey, \{ by: caller\.role, appendix \}\)/.test(route), "and builds the unsigned doc with the appendix");

  const signer = readFileSync(new URL("../app/project/[accessId]/esign/esign-signer.jsx", import.meta.url), "utf8");
  assert.ok(/prepareAppendix/.test(signer) && /fetch\("\/api\/esign\/prepare"/.test(signer), "the signer renders + POSTs the appendix to the route");
  assert.ok(/startSignAction\(accessId, optKey, store\.get\(tokenKey\(accessId, optKey\)\)\)/.test(signer), "then opens the session on the prepared doc");
});

test("sign-off: the signer emits a survey/mockup sign-off page + each signature spot is placed deliberately", () => {
  // proposal-pdf.js adds the sign-off page with its own fields, signing mode only, only when there's an appendix.
  const pdf = readFileSync(new URL("../lib/proposal-pdf.js", import.meta.url), "utf8");
  assert.ok(/if \(\(surveyImages\.length \|\| mockupImages\.length\) && \(ackSigning \|\| ackForm\)\)/.test(pdf), "the sign-off page renders for the signer OR the download, appendix-only");
  assert.ok(/sectionHeader\("SITE SURVEY & SYSTEM MOCKUP"/.test(pdf), "it has its own section header");
  assert.ok(/ackFrac\("name_ack", "name"/.test(pdf) && /ackFrac\("date_ack", "date"/.test(pdf) && /ackFrac\("signature_ack", "signature"/.test(pdf), "the signer gets overlay fields (*_ack)");
  assert.ok(/push\("name", "survey_mockup_client_name"/.test(pdf) && /push\("sign", "survey_mockup_authorized_signature"/.test(pdf), "the download gets real AcroForm fields");

  // flatten.js anchors the certification block to the FIRST signature (acceptance), not the sign-off one.
  const flat = readFileSync(new URL("../lib/esign/flatten.js", import.meta.url), "utf8");
  assert.ok(/if \(!sigPlace\) sigPlace = \{ page, left, w, bottom, W, H \}/.test(flat), "cert anchors to the first signature");

  // esign-signer.jsx: adopt once, then place each signature spot deliberately — each placement PERSISTS on
  // adopt (field green only after the server confirms), and the last one auto-completes (no Finish to save).
  const signer = readFileSync(new URL("../app/project/[accessId]/esign/esign-signer.jsx", import.meta.url), "utf8");
  assert.ok(/const allPlaced = sigFields\.length > 0 && sigFields\.every\(\(f\) => placed\.has\(f\.key\)\)/.test(signer), "every signature spot must be placed");
  assert.ok(/saveSignValuesAction\(accessId, sess\.token, \{ placed: nextKeys \}\)/.test(signer), "placing a spot persists it server-side (green only after the server confirms)");
  assert.ok(/if \(allNow\) autoComplete\(/.test(signer), "the last placement auto-completes — signing never depends on Finish");
  assert.ok(/else placeSaved\(f\.key\)/.test(signer), "tapping an empty spot with a signature adopted places + saves it");
  assert.ok(/done = system \? true : f\.type === "name" \? !!values\.name : placed\.has\(f\.key\)/.test(signer), "a signature spot shows the signature only once placed");
});
