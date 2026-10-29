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

test("proposal customer view: Signature-Requested attention opens the PDF signer DIRECTLY (no spotlight)", () => {
  // The guided spotlight was removed from the customer sign flow (per owner): Review & sign goes straight
  // to the real PDF signer. The reusable engine file still exists (test above) but is no longer wired here.
  assert.ok(!pcv.includes("doc-review-spotlight"), "customer view no longer imports/renders the spotlight");
  assert.ok(!/setSpotlightOn|reviewSteps/.test(pcv), "no spotlight state or step list remains");
  // version-aware attention (server truth = unsigned+actionable; keyed per version so refresh never re-nags)
  assert.ok(/const needsSig = isCustomerView && canAct && !locked/.test(pcv), "needs-signature derives from the actionable, unsigned state (not local UI)");
  assert.ok(/const verKey = p \? `docrev:\$\{accessId\}:prop:v\$\{p\.version \|\| 1\}:\$\{p\.id\}`/.test(pcv), "attention is keyed to the document version");
  // big banner → compact pill; neither shows once signed (needsSig gates both)
  assert.ok(pcv.includes("pcv-sigbanner") && pcv.includes("Signature requested"), "big banner for a signature request");
  assert.ok(pcv.includes("pcv-sigpill") && pcv.includes("Signature required"), "compact persistent pill after dismiss");
  // startReview → straight to the signer (choose → setEsignFor), no walkthrough
  assert.ok(pcv.includes("const startReview = () => { markSeen(); if (opt) choose(opt.id);"), "Review & sign opens the signer directly and marks the version seen");
  assert.ok(/function choose\(optId\)[\s\S]*setEsignFor\(optId\)/.test(pcv), "choose() opens the e-sign PDF signer");
  // the old summary block (Your System / Total Investment / Project Cost Breakdown) is gone
  assert.ok(!pcv.includes("Total Investment") && !pcv.includes("Project Cost Breakdown") && !pcv.includes("pcv-sum-cats"), "the redundant cost-summary card was removed");
});

test("gateway: a proposal/sign deep-link lands the deck on the proposal stage (not the customer's pointer)", () => {
  const gw = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
  assert.ok(/_wantsProposalLanding = .*open.*=== "proposal" \|\| .*get\("sign"\) != null/.test(gw), "detects ?open=proposal / ?sign= as a proposal landing");
  assert.ok(/stageParamRef = useRef\(searchParams\?\.get\("stage"\) \|\| \(_wantsProposalLanding \? "proposal" : null\)\)/.test(gw), "seeds the initial stage to proposal so the signer isn't opened behind Site Survey");
});
