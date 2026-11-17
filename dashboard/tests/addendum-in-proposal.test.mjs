import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addendumLabel, addendumRowText, proposalIsSigned, canStartAddendum, proposalCardAction } from "../lib/addendum-display.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("+ Addendum is gated on a signed version (absent, not disabled)", () => {
  assert.equal(proposalIsSigned({ status: "draft" }), false);
  assert.equal(proposalIsSigned({ status: "sent" }), false);
  assert.equal(proposalIsSigned({ status: "accepted" }), true);
  assert.equal(proposalIsSigned({ status: "sent", signed_at: "2026-11-20 10:00:00" }), true);
  assert.equal(canStartAddendum({ signed: false, canBuild: true }), false);
  assert.equal(canStartAddendum({ signed: true, canBuild: false }), false);
  assert.equal(canStartAddendum({ signed: true, canBuild: true }), true);
  const foot = read("../app/project/[accessId]/proposal-footer.jsx");
  assert.match(foot, /const addendum = canAddendum \? \(/);   // rendered only when allowed, never a disabled twin
  assert.doesNotMatch(foot, /disabled=\{!canAddendum\}/);
});

test("footer order is Record Payment, + Addendum, Download", () => {
  const foot = read("../app/project/[accessId]/proposal-footer.jsx");
  assert.match(foot, /\{recordPay\}\{addendum\}\{download\}/);
  assert.match(foot, /className="prop-foot-pay"[^>]*onClick=\{onAddendum\}>\+ Addendum</);
});

test("A1/A2 labels come from array position only", () => {
  assert.equal(addendumLabel(0), "A1");
  assert.equal(addendumLabel(1), "A2");
  assert.equal(addendumRowText({ status: "approved", signedAt: "2026-11-20T15:00:00Z" }, 0), "A1 · Nov 20 · Signed");
  assert.equal(addendumRowText({ status: "pending", sentAt: "2026-11-21T15:00:00" }, 1), "A2 · Nov 21 · Pending");
  assert.equal(addendumRowText({ status: "voided" }, 2), "A3 · Voided");
  // nothing is persisted: the editor never writes a number onto the record
  const ed = read("../app/project/[accessId]/install-addendum.jsx");
  assert.doesNotMatch(ed, /addendumLabel|\bnumber:|ordinal/);
  const act = read("../app/project/[accessId]/proposal-actions.js");
  assert.match(act, /list\.map\(\(a, i\) =>[\s\S]*addendumLabel\(i\)/);
});

test("portal Proposal card: zero / one / several addenda", () => {
  assert.equal(proposalCardAction("Completed", 0), "Completed");
  assert.equal(proposalCardAction("Completed", undefined), "Completed");
  assert.equal(proposalCardAction("Completed", 1), "Completed · 1 addendum");
  assert.equal(proposalCardAction("Completed", 3), "Completed · 3 addendums");
  assert.equal(proposalCardAction("Edit", 2), "Edit");   // only a done card carries the count
  // The done WORD is the card's to choose, so the count follows the done FLAG, not the literal
  // "Completed" — matching on the word dropped the addendum count the moment it became "Signed".
  assert.equal(proposalCardAction("Signed", 1, true), "Signed · 1 addendum");
  assert.equal(proposalCardAction("Signed", 2, true), "Signed · 2 addendums");
  assert.equal(proposalCardAction("Signed", 0, true), "Signed");
  assert.equal(proposalCardAction("Edit", 2, false), "Edit");
  const gw = read("../app/project/[accessId]/gateway-client.jsx");
  assert.doesNotMatch(gw, /key: "addendum", title: "Addendum"/);   // the separate card is gone
});

test("addendum paths never reach signProposal (signed original is never re-signed)", () => {
  for (const f of ["../app/project/[accessId]/install-addendum.jsx", "../app/project/[accessId]/addendum-builder.jsx", "../app/project/[accessId]/proposal-footer.jsx", "../app/api/addendum/route.js"]) {
    assert.doesNotMatch(read(f), /signProposal/, f);
  }
  assert.match(read("../app/project/[accessId]/proposal-builder.jsx"), /composeOnly/);
});
