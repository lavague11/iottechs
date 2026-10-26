// Grouped-equipment presentation guards: NVR / Displays / Amp render as PARENT + their REAL child records (no
// count-only "N drives / N displays" line), totals still come from the same aggregates, infrastructure never
// enters endpoint numbering, and the open-count eye no longer occupies the embedded header strip.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

test("children are shown by default (collapse is opt-in) using the existing frameless .prop-sub2 row", () => {
  assert.ok(editor.includes("leadOpen[lr.key] !== false && lr.items?.length > 0"));
  assert.ok(editor.includes('className="prop-sub2 static"'));
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
