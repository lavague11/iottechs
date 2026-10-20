// Customer document-review: Signature-Requested attention + reusable guided spotlight → canonical signer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const spot = readFileSync(new URL("../app/project/[accessId]/doc-review-spotlight.jsx", import.meta.url), "utf8");
const pcv = readFileSync(new URL("../app/project/[accessId]/proposal-customer-view.jsx", import.meta.url), "utf8");

test("spotlight is a REUSABLE, document-agnostic engine (steps in, onFinish/onClose out) that never signs", () => {
  assert.ok(/export default function DocReviewSpotlight\(\{ steps = \[\], onFinish, onClose/.test(spot), "takes ordered steps + finish/close callbacks");
  assert.ok(spot.includes("scrollIntoView"), "scrolls the target into view");
  assert.ok(spot.includes("box-shadow:0 0 0 9999px"), "dims the page while keeping the target bright (cut-out ring)");
  assert.ok(spot.includes('e.key === "Escape"') && spot.includes("ArrowLeft") && spot.includes("ArrowRight"), "keyboard: Esc/close + Back/Next");
  assert.ok(spot.includes("window.addEventListener(\"scroll\"") && spot.includes("window.addEventListener(\"resize\""), "tracks the target through scroll + resize");
  assert.ok(spot.includes("prefers-reduced-motion"), "reduced-motion aware");
  // the engine itself must not create approval/signature — only onFinish (which the host wires to the signer)
  assert.ok(!/sign|accept|approve/i.test(spot.replace(/Review &amp; Sign|Sign\b(?=[^(]*\})/g, "")) || !/setEsignFor|doAccept|signProposal/.test(spot), "spotlight contains no signing/acceptance logic");
});

test("proposal customer view: Review & Sign label + Signature-Requested attention wired to the spotlight", () => {
  assert.ok(pcv.includes('import DocReviewSpotlight from "./doc-review-spotlight"'), "imports the reusable spotlight");
  // label change: the CTA is Review & Sign (not Approve & Sign)
  assert.ok(pcv.includes("Review &amp; Sign"), "CTA reads Review & Sign");
  assert.ok(!/\{diffInfo \? "Review & Sign" : "Approve & Sign"\}/.test(pcv), "the old Approve & Sign label is gone");
  // version-aware attention (server truth = unsigned+actionable; keyed per version so refresh never re-nags)
  assert.ok(/const needsSig = isCustomerView && canAct && !locked/.test(pcv), "needs-signature derives from the actionable, unsigned state (not local UI)");
  assert.ok(/const verKey = p \? `docrev:\$\{accessId\}:prop:v\$\{p\.version \|\| 1\}:\$\{p\.id\}`/.test(pcv), "attention is keyed to the document version");
  // big banner → compact pill; neither shows once signed (needsSig gates both)
  assert.ok(pcv.includes("pcv-sigbanner") && pcv.includes("Signature requested") && pcv.includes("Review document"), "big banner with a Review document CTA");
  assert.ok(pcv.includes("pcv-sigpill") && pcv.includes("Signature required"), "compact persistent pill after dismiss");
  // Review document → guided spotlight (cost → payment → sign); the FINAL step reuses the canonical signer
  assert.ok(/reviewSteps = \(\) => \[[\s\S]*costRef[\s\S]*payRef[\s\S]*signRef/.test(pcv), "steps: cost → payment terms → review & sign");
  assert.ok(/onFinish=\{\(\) => \{ setSpotlightOn\(false\); if \(opt\) choose\(opt\.id\); \}\}/.test(pcv), "finishing the spotlight opens the existing signer (choose → setEsignFor), it does not sign directly");
  assert.ok(pcv.includes("const startReview = () => { markSeen(); setSpotlightOn(true); }"), "Review document starts the spotlight and marks the version seen");
});
