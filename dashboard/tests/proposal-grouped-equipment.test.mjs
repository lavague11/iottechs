// Grouped-equipment presentation guards: NVR / Displays / Amp render as PARENT + their REAL child records (no
// count-only "N drives / N displays" line), totals still come from the same aggregates, infrastructure never
// enters endpoint numbering, and the open-count eye no longer occupies the embedded header strip.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nvrSummary, dispSummary } from "../lib/proposal.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const editor = read("../app/project/[accessId]/proposal-items-editor.jsx");
const builder = read("../app/project/[accessId]/proposal-builder.jsx");
const footer = read("../app/project/[accessId]/proposal-footer.jsx");
const panel = read("../app/project/[accessId]/proposal-panel.jsx");

test("lead rows carry no count-only secondary line", () => {
  assert.ok(!/\bsub:\s*[^\n]*(drive|display|rack)/i.test(editor), "no drive/display/rack count metadata on lead rows");
  assert.ok(!editor.includes("lr.sub") && !editor.includes("prop-sysline-sub"), "lead row no longer renders lr.sub");
  assert.ok(!panel.includes("prop-sysline-sub"), "its CSS is gone too");
});

test("NVR parent lists the recorder + every real drive record; totals use the unchanged aggregates", () => {
  assert.ok(/total: nvrGroupTotal/.test(editor));
  assert.ok(/items: \[\{ name: nvrItem\.name[\s\S]*?\.\.\.driveItems\.map\(/.test(editor), "recorder + driveItems.map");
  assert.ok(/const nvrGroupTotal = nvrItem \? itemTotal\(nvrItem\) \+ driveItems\.reduce/.test(editor), "aggregate math untouched");
});

test("Displays parent renders one child per distinct display record, named Display N", () => {
  assert.ok(/total: displaysTotal/.test(editor));
  assert.ok(/items: displayItems\.map\(\(d\) => \(\{ name: `Display \$\{d\.displaySlot\} · /.test(editor));
  assert.ok(/const displaysTotal = displayItems\.reduce\(\(s, it\) => s \+ itemTotal\(it\)/.test(editor));
});

test("nvrSummary: channel + each drive capacity, derived from children; repeats collapse to N×", () => {
  assert.equal(nvrSummary({ name: "NVR (16-Channel)" }, [{ name: "8TB Storage Drive" }, { name: "4TB Storage Drive" }]), "16CH + 8TB + 4TB");
  assert.equal(nvrSummary({ name: "NVR (8-Channel)" }, [{ name: "8TB Storage Drive" }]), "8CH + 8TB");
  assert.equal(nvrSummary({ name: "NVR (32-Channel)" }, [{ name: "8TB Storage Drive" }, { name: "8TB Storage Drive" }]), "32CH + 2×8TB");
  assert.equal(nvrSummary({ name: "NVR (16-Channel)" }, []), "16CH");                 // no drives → channel only
  assert.equal(nvrSummary({ name: "" }, [{ name: "8TB Storage Drive" }]), "8TB");      // graceful: capacity only
});

test("dispSummary: counts when 2+ displays, bare label for one; CX Provided normalized", () => {
  assert.equal(dispSummary([{ name: "Customer Provided" }, { name: "Monitor + Mount" }]), "1 CX Provided + 1 Monitor + Mount");
  assert.equal(dispSummary([{ name: "Monitor + Mount" }, { name: "Monitor + Mount" }]), "2 Monitor + Mount");
  assert.equal(dispSummary([{ name: "CX Provided" }, { name: "CX Provided" }]), "2 CX Provided");
  assert.equal(dispSummary([{ name: "Customer Provided" }]), "CX Provided");            // single → no count
  assert.equal(dispSummary([]), "");
});

test("the collapsed summary is derived from children and shown ONLY while collapsed (never expanded)", () => {
  assert.ok(editor.includes("summary: nvrSummary(nvrItem, driveItems)"), "NVR lead row carries a children-derived summary");
  assert.ok(editor.includes("summary: dispSummary(displayItems)"), "Displays lead row carries a children-derived summary");
  assert.ok(/lr\.summary && leadOpen\[lr\.key\] === false &&/.test(editor), "summary renders only when the group is collapsed");
  assert.ok(editor.includes('displayItems.length === 1 ? "Display" : "Displays"'), "Displays title pluralizes naturally");
  assert.ok(panel.includes(".pvx .prop-sysline-sum{"), "muted inline summary style exists");
  assert.ok(/prop-sysline-sum\{order:9;flex:1 1 100%/.test(panel), "on mobile it drops to its own line");
});

test("children are shown by default (collapse is opt-in) using the existing frameless .prop-sub2 row", () => {
  assert.ok(editor.includes("leadOpen[lr.key] !== false && lr.items?.length > 0"));
  assert.ok(editor.includes('className="prop-sub2 static"'));
});

test("ONE canonical child-row grammar: local A/B/C badge + zebra on camera, NVR AND Displays alike", () => {
  // Camera sub-items: letter is local to the parent (restarts at A) and the row zebra-stripes by index.
  assert.ok(/const subRow = \(x, parent, idx = 0\)/.test(editor), "subRow takes a per-parent index");
  assert.ok(/String\.fromCharCode\(65 \+ \(idx % 26\)\)/.test(editor), "A/B/C derived from the local index");
  assert.ok(/\(it\.sub \|\| \[\]\)\.map\(\(x, i\) => subRow\(x, it, i\)\)/.test(editor), "index passed per parent (restarts at A)");
  // Lead children (NVR/Displays) use the SAME badge + zebra, not a separate styling.
  assert.ok(/String\.fromCharCode\(65 \+ \(bidx % 26\)\)/.test(editor), "lead children carry the same local badge");
  const badges = (editor.match(/className="prop-sub2-badge" aria-hidden="true"/g) || []).length;
  assert.ok(badges >= 3, `badge appears in all child renderers (compact, editing, lead) — found ${badges}`);
  // Zebra: alternating class on both child renderers.
  assert.ok(/prop-sub2-wrap\$\{idx % 2 \? " alt" : ""\}/.test(editor) && /prop-sub2-wrap\$\{bidx % 2 \? " alt" : ""\}/.test(editor), "both renderers alternate rows");
  // Decorative: the badge is aria-hidden; the compact row keeps an accessible 'Sub-item A: <name>' label.
  assert.ok(/aria-label=\{`Sub-item \$\{letter\}: \$\{x\.name/.test(editor), "accessible label, not a bare letter");
});

test("child badge + zebra are presentation-only: subordinate badge, neutral tint, hover still distinct", () => {
  assert.ok(panel.includes(".pvx .prop-sub2-badge{"), "child badge style exists");
  assert.ok(/prop-sub2-wrap\.alt>\.prop-sub2\{background:rgba\(17,20,24,\.022\)\}/.test(panel), "zebra is a very light NEUTRAL tint");
  // Hover must beat the zebra so interaction stays legible (owner rule 14).
  assert.ok(/button\.prop-sub2\.compact:hover\{background:rgba\(17,20,24,\.055\)\}/.test(panel), "hover is stronger than the zebra");
  // Child names wrap rather than truncate (no price pushed off-screen).
  assert.ok(/\.prop-sub2-name\{[^}]*white-space:normal/.test(panel), "child names wrap, not ellipsis");
  // Group boundary: extra spacing below an expanded group / infra lead, not a heavy border.
  assert.ok(/prop-block\.prop-open\{[^}]*margin-bottom:10px/.test(panel) && /\.prop-lead\{margin-bottom:8px\}/.test(panel), "group boundary via spacing");
});

test("infrastructure lead rows never take an endpoint number", () => {
  assert.ok(editor.includes('if (lineRole(it) === "endpoint") blockNumOf[it.id] = ++_epN;'));
  assert.ok(!/leadRows\.forEach[^\n]*blockNumOf/.test(editor));
});

test("embedded header strip no longer holds the eye, the AI bar, or + Option; the dock ••• is gone", () => {
  assert.ok(/prop-head-info">\{previewChip\}<\/div>/.test(builder), "strip = preview chip only (no eye, no + Option)");
  assert.ok(!/prop-head-info">[^<]*\{eye\}/.test(builder));
  assert.ok(!/<AiCommandBar/.test(builder), "the AI command bar is removed from the proposal top");
  assert.ok(!/prop-opt-add/.test(builder), "the + Option button is removed");
  assert.ok(panel.includes(".pvx .prop-head-info:empty{display:none}"), "empty strip collapses");
  // The dock's overflow menu (and its Views item) is gone; the open-count eye now lives only on the
  // standalone header, and the recordProposalView/onShowViews plumbing is still intact.
  assert.ok(!footer.includes("Views · {viewCount}") && !footer.includes('kind="more"'), "no ••• / Views in the dock");
  assert.ok(builder.includes("onShowViews") && builder.includes("const eye ="), "open-count eye + onShowViews plumbing intact");
});
