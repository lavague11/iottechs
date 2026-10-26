// E-sign: the signed PDF carries a DocuSign-style certification block UNDER the authorized signature —
// full timestamp + signer + verification method + IP + immutable document reference. complete.js passes
// the cert facts to the FINAL flatten only (never the dry run), and flatten.js stamps them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const flatten = readFileSync(new URL("../lib/esign/flatten.js", import.meta.url), "utf8");
const complete = readFileSync(new URL("../lib/esign/complete.js", import.meta.url), "utf8");

test("flatten.js stamps the certification block only when meta.certify, under the signature", () => {
  assert.ok(/let sigPlace = null;/.test(flatten), "it remembers where the signature landed");
  assert.ok(/sigPlace = \{ page, left, w, bottom/.test(flatten), "the signature branch records the placement");
  assert.ok(/if \(sigPlace && meta\.certify\)/.test(flatten), "the block is gated on sigPlace + meta.certify");
  assert.ok(/Electronically signed by \$\{values\.name\}/.test(flatten), "line 1 names the signer");
  assert.ok(/Verified via \$\{meta\.via\}/.test(flatten), "it states the verification method");
  assert.ok(/IP \$\{meta\.ip\}/.test(flatten), "it stamps the signer's IP when present");
  assert.ok(/Certificate of Completion on file/.test(flatten), "it points at the standalone certificate");
  // drawn in small gray type below the signature line (bottom - N), clamped to the field width
  assert.ok(/let y = bottom - 9;/.test(flatten), "it sits just below the signature line");
});

test("complete.js passes the cert meta to the FINAL flatten, not the dry run", () => {
  const dry = complete.slice(0, complete.indexOf("const live = getPublishedProposal"));
  assert.ok(!/certify: true/.test(dry), "the dry-run flatten is left unstamped");
  assert.ok(/reference = `PROP-\$\{String\(row\.id\)\.padStart\(4, "0"\)\}-v\$\{row\.version\}`/.test(complete), "an immutable document reference is built");
  assert.ok(/meta: \{ certify: true, reference, fingerprint: s\.fingerprint, via: s\.via_pin \? "Project PIN" : "Account sign-in", ip \}/.test(complete), "the final flatten receives certify + reference + fingerprint + via + ip");
});
