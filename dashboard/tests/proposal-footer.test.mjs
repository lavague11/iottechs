// The proposal's ONE action area is a FRAMELESS, state-driven footer: two rows max (compact metadata +
// one action row), inline (never floating), driven by the published-vs-working change state, reusing the
// existing handlers. Presentation only — source-read wiring checks. See CLAUDE.md "PROPOSAL ARCHITECTURE".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const footer = read("../app/project/[accessId]/proposal-footer.jsx");
const builder = read("../app/project/[accessId]/proposal-builder.jsx");
const panel = read("../app/project/[accessId]/proposal-panel.jsx");

test("footer is frameless (thin top divider, no card border/shadow) and inline, not floating", () => {
  const rule = panel.match(/\.pvx \.prop-foot\{[^}]*\}/)?.[0] || "";
  assert.ok(rule, "prop-foot rule exists");
  assert.ok(!/sticky|fixed|absolute/.test(rule), `not floating: ${rule}`);
  assert.ok(/border-top:/.test(rule) && !/box-shadow/.test(rule) && !/border:1px/.test(rule), `frameless: ${rule}`);
  assert.ok(/margin-bottom/.test(rule), "leaves a gap before the next section");
});

test("footer states: Submit / Request Signature / Send Revision / Revise, driven by the canonical flags", () => {
  for (const s of ["Submit", "Request Signature", "Send Revision", "Revise", "unsent", "financialDelta", "changeCount"]) {
    assert.ok(footer.includes(s), `missing ${s}`);
  }
  // State flags come from the builder (one definition), not recomputed here.
  for (const f of ["hasUnsent", "isSentUnsigned", "isDraftNew", "isLocked"]) {
    assert.ok(footer.includes(f), `footer keys off ${f}`);
  }
});

test("the ••• overflow menu and the separate View Changes button are gone", () => {
  assert.ok(!footer.includes("More actions") && !footer.includes('kind="more"'), "no ••• menu");
  assert.ok(!/>View Changes</.test(footer), "no standalone View Changes button");
  // The unsent-changes summary itself is the tap target that opens the diff.
  assert.ok(/prop-foot-chg[\s\S]*setChangesOpen\(true\)/.test(footer), "tapping the change summary opens the diff");
});

test("Revise appears ONLY when lifecycle-locked; never in the sent/unsigned state", () => {
  // The only onRevise wiring in the footer is guarded by isLocked.
  const locked = footer.match(/isLocked[\s\S]*?onRevise/);
  assert.ok(locked, "Revise is rendered under isLocked");
  // Sent/unsigned branch shows Request Signature, not Revise.
  const sent = footer.slice(footer.indexOf("else if (isSentUnsigned)"), footer.indexOf("else if (isLocked)"));
  assert.ok(sent.includes("onRequestSign") && !sent.includes("onRevise"), "sent/unsigned = Request Signature, no Revise");
});

test("Download is a labelled secondary with Standard/Detailed only — no Survey, no giant menu", () => {
  assert.ok(footer.includes("prop-foot-dl"), "labelled secondary Download control");
  assert.ok(/Download\s*<\/button>/.test(footer), "the Download button carries its text label");
  assert.ok(footer.includes('act("standard")') && footer.includes('act("detailed")') && footer.includes("onDownload(mode)"), "Standard + Detailed");
  assert.ok(!footer.includes('"survey"'), "no Survey in the footer download menu");
});

test("edit-to-revise: a sent/unsigned proposal is editable, and save() mints the draft before persisting", () => {
  assert.ok(builder.includes("const editableSent"), "sent/unsigned is editable for staff");
  assert.ok(/readOnly = !\(status === "draft" \|\| editableSent\)/.test(builder), "readOnly derived from editableSent");
  // save() auto-revises when editing a non-draft (immutable) version, without adopting its payload.
  const save = builder.slice(builder.indexOf("async function save()"), builder.indexOf("async function send()"));
  assert.ok(/status !== "draft"[\s\S]*reviseProposalAction\(accessId\)/.test(save), "save() revises a sent version first");
  assert.ok(save.includes("setMeta(rv.proposal)") && !/adopt\(rv\.proposal\)/.test(save), "adopts only the new meta, not its payload");
});

test("builder feeds the footer from getProposalChangeStateAction and passes the canonical flags + handlers", () => {
  assert.ok(builder.includes("getProposalChangeStateAction(accessId)"));
  for (const h of ["onSend={send}", "onRevise={revise}", "onDownload={handleDownload}", "onRequestSign={() => setSigSheet(true)}",
                   "hasUnsent={hasUnsent}", "isSentUnsigned={isSentUnsigned}", "isDraftNew={isDraftNew}", "isLocked={isLocked}"]) {
    assert.ok(builder.includes(h), `missing ${h}`);
  }
  // The footer no longer carries the overflow-only props (Copy Link / Email / Config / Views live elsewhere).
  assert.ok(!builder.includes("onConfig={() => setPricingOpen"), "footer no longer owns Configuration");
});
