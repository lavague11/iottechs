// Floating-tools lane — the contract that keeps Maya, the bug reporter and the help widget out of the
// page's way. Two failure modes are frozen here:
//   1. a tool hand-types its own bottom/right  → two tools drift onto the same spot (the help widget
//      and the bug reporter used to sit 4px apart, on top of each other)
//   2. a scrolling page reserves nothing       → the last row parks under a button at the end of the
//      scroll (the survey's device cards, the proposal's totals)
// Source assertions, house style — the live geometry is checked in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const globals = read("app/globals.css");

// Every floating tool: where it lives, and which slot of the lane it may occupy.
const TOOLS = [
  { file: "app/components/bug-reporter.jsx", sel: ".bugr-fab", side: "right", slot: "--dock-bottom" },
  { file: "app/project/[accessId]/customer-assistant.jsx", sel: ".cust-ai", side: "right", slot: "--dock-stack" },
  { file: "app/project/[accessId]/command-surface.jsx", sel: ".aicore-dock", side: "left", slot: "--dock-bottom" },
  { file: "app/project/[accessId]/command-surface.jsx", sel: ".aicore-diag", side: "left", slot: "--dock-stack" },
];
// Page-level scroll containers that must reserve the lane.
const RESERVES = [
  { file: "app/globals.css", sel: ".wrap" },
  { file: "app/project/[accessId]/customer-portal.jsx", sel: ".cpv-ovl-body" },   // tool overlays (survey, proposal)
  { file: "app/project/[accessId]/customer-portal.jsx", sel: ".cpv-main" },
  { file: "app/project/[accessId]/deck-view.jsx", sel: ".dv-overlay-body" },
  { file: "app/components/admin-shell.jsx", sel: ".apx footer" },
  { file: "app/tools/sop-builder/sop-builder-css.js", sel: ".sopb" },
];

// The LAST declaration of a selector wins in CSS, so assert against that one.
function ruleFor(src, sel) {
  const re = new RegExp(`\\${sel.replace(/\s+/g, "\\s+")}\\s*\\{([^}]*)\\}`, "g");
  const all = [...src.matchAll(re)].map((m) => m[1]);
  assert.ok(all.length, `${sel} is declared`);
  return all;
}

test("globals.css owns the lane tokens, and they add up", () => {
  const root = globals.slice(globals.indexOf(":root"), globals.indexOf("}", globals.indexOf(":root")));
  for (const t of ["--dock-gap", "--dock-btn", "--dock-safe", "--dock-bottom", "--dock-stack", "--dock-lane"]) {
    assert.ok(root.includes(t + ":"), `${t} is defined on :root`);
  }
  // A page reserves the button plus a gap above AND below it, so a tool never touches the content edge.
  assert.match(root, /--dock-lane:\s*calc\(var\(--dock-btn\)\s*\+\s*var\(--dock-gap\)\s*\*\s*2\s*\+\s*var\(--dock-safe\)\)/);
  // The second slot clears the first by a full button height, so two tools on one side can't overlap.
  assert.match(root, /--dock-stack:\s*calc\(var\(--dock-bottom\)\s*\+\s*var\(--dock-btn\)\s*\+\s*\d+px\)/);
  // The safe-area fallback keeps the lane finite on browsers without env().
  assert.match(root, /--dock-safe:\s*env\(safe-area-inset-bottom,\s*0px\)/);
  assert.match(globals, /html\s*\{[^}]*scroll-padding-bottom:\s*var\(--dock-lane\)/, "anchor jumps clear the lane");
});

test("every floating tool positions from the tokens — never a hand-typed offset", () => {
  for (const { file, sel, side, slot } of TOOLS) {
    const rule = ruleFor(read(file), sel).find((r) => r.includes("position:fixed"));
    assert.ok(rule, `${sel} is fixed`);
    assert.match(rule, new RegExp(`bottom:\\s*var\\(${slot}`), `${sel} sits in the ${slot} slot`);
    assert.match(rule, new RegExp(`${side}:\\s*var\\(--dock-gap`), `${sel} is inset by --dock-gap on the ${side}`);
    assert.doesNotMatch(rule, /bottom:\s*\d/, `${sel} must not hand-type a bottom offset`);
    assert.doesNotMatch(rule, /bottom:\s*calc\(\s*\d/, `${sel} must not hand-type a bottom calc`);
  }
});

test("two tools on the same side never claim the same slot", () => {
  for (const side of ["left", "right"]) {
    const slots = TOOLS.filter((t) => t.side === side).map((t) => t.slot);
    assert.equal(new Set(slots).size, slots.length, `${side} side: one tool per slot (got ${slots.join(", ")})`);
  }
});

test("page-level scroll containers reserve the lane", () => {
  for (const { file, sel } of RESERVES) {
    const rules = ruleFor(read(file), sel);
    assert.ok(rules.some((r) => /padding(-bottom)?:[^;]*var\(--dock-lane/.test(r)),
      `${sel} (${file}) must reserve var(--dock-lane) at the bottom`);
  }
});

test("the tool overlay — where the bug was reported — reserves it unconditionally", () => {
  // .cpv-ovl-body is the scroller behind ?view=survey / ?view=proposal. It had no bottom padding, so the
  // device roster and the proposal totals ended flush with the viewport, under the buttons.
  const rule = ruleFor(read("app/project/[accessId]/customer-portal.jsx"), ".cpv-ovl-body").find((r) => r.includes("overflow-y:auto"));
  assert.ok(rule, ".cpv-ovl-body is the scroller");
  assert.match(rule, /padding-bottom:\s*var\(--dock-lane\)/);
  assert.doesNotMatch(rule, /@media/, "the reserve is not behind a breakpoint");
});
