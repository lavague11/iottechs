// Phase 6: the proposal's ONE action footer is inline (never floating), state-driven from the change state,
// and reuses the existing handlers. Source-read wiring checks (the footer is presentation only).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const footer = read("../app/project/[accessId]/proposal-footer.jsx");
const builder = read("../app/project/[accessId]/proposal-builder.jsx");
const panel = read("../app/project/[accessId]/proposal-panel.jsx");

test("footer is inline in the flow, not sticky/floating", () => {
  const rule = panel.match(/\.pvx \.prop-dock\{[^}]*\}/)?.[0] || "";
  assert.ok(rule, "prop-dock rule exists");
  assert.ok(!/sticky|fixed|absolute/.test(rule), rule);
});

test("footer states: Revise / Send Revision / View Changes / unsent-change summary", () => {
  for (const s of ["Revise", "Send Revision", "View Changes", "Request Signature", "Submit", "since Version", "unsent"]) {
    assert.ok(footer.includes(s), `missing ${s}`);
  }
  assert.ok(footer.includes("financialDelta") && footer.includes("changeCount"), "reads the change state");
});

test("builder feeds the footer from getProposalChangeStateAction and passes the existing handlers", () => {
  assert.ok(builder.includes("getProposalChangeStateAction(accessId)"));
  for (const h of ["onSend={send}", "onRevise={revise}", "onDownload={handleDownload}", "onCopyLink={shareProposal}", "onEmail={emailToCustomer}", "setSigSheet(true)"]) {
    assert.ok(builder.includes(h), `missing ${h}`);
  }
  assert.ok(!builder.includes("prop-dock-edit"), "old Edit dock button is gone");
});
