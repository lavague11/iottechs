// Every .js/.jsx file under app/ and lib/ must parse with the SAME SWC transform
// Next uses to build. This project has no typecheck and no lint, so without this a
// syntax error in JSX passes the whole suite (no other test parses JSX) and only
// surfaces at `next build` — or, in dev, as a 500 on the page that imports it.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "public", "tests", "docs", ".git"]);

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) collect(abs, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(abs);
  }
  return out;
}

test("every app/ and lib/ source file parses with Next's SWC", async () => {
  const swc = await import("next/dist/build/swc/index.js");
  const mod = swc.default && swc.default.transform ? swc.default : swc;
  if (typeof mod.loadBindings === "function") await mod.loadBindings();
  assert.equal(typeof mod.transform, "function", "SWC transform unavailable");

  const files = [...collect(path.join(ROOT, "app")), ...collect(path.join(ROOT, "lib"))];
  assert.ok(files.length > 50, `expected to find many source files, found ${files.length}`);

  const failures = [];
  for (const abs of files) {
    try {
      await mod.transform(readFileSync(abs, "utf8"), {
        filename: abs,
        jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022" },
      });
    } catch (e) {
      const first = String((e && e.message) || e)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" | ");
      failures.push(`${path.relative(ROOT, abs)}: ${first}`);
    }
  }

  assert.deepEqual(failures, [], `${failures.length} file(s) do not parse:\n  ${failures.join("\n  ")}`);
});

// The widgets are plain HTML with large inline <script> blocks — the survey editor, the satellite
// capture tool and the floor-plan tool all live there, thousands of lines of it. Next never builds
// them, so the test above cannot see them, and the other widget tests brace-extract single functions
// and run them in a vm, which a syntax error elsewhere in the file sails past.
test("every inline <script> in public/widgets parses", () => {
  const dir = path.join(ROOT, "public", "widgets");
  const html = readdirSync(dir).filter((n) => n.endsWith(".html"));
  assert.ok(html.length >= 3, `expected the widget HTML files, found ${html.length}`);

  const failures = [];
  let blocks = 0;
  for (const name of html) {
    const src = readFileSync(path.join(dir, name), "utf8");
    // inline blocks only: a tag carrying src= loads a separate file, covered as its own .js
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(src))) {
      const code = m[1];
      if (!code.trim()) continue;
      blocks++;
      const line = src.slice(0, m.index).split("\n").length;
      try {
        new vm.Script(code, { filename: `${name}:${line}` });
      } catch (e) {
        failures.push(`${name} (script at line ${line}): ${String((e && e.message) || e).split("\n")[0]}`);
      }
    }
  }

  assert.ok(blocks >= 3, `expected inline scripts to be found, got ${blocks}`);
  assert.deepEqual(failures, [], `${failures.length} inline script(s) do not parse:\n  ${failures.join("\n  ")}`);
});

// Every widget function the test suite brace-extracts must still be extractable.
//
// The extractors in tests/survey-*.test.mjs count braces and treat a quote character as the start of
// a string. One apostrophe in a comment inside a function body — "the armed type's icon" — opens a
// string that only closes at some unrelated quote later in the file, so the extractor walks past the
// real closing brace. It then either explodes with a syntax error or, worse, silently asserts against
// the wrong code. Both happened while fixing Group 1.
//
// This compares a COMMENT-AWARE scan of each function against the naive brace count the test
// extractors use. When they disagree, the function is a trap, and the message says which comment.
test("widget functions used by the test suite extract cleanly (no quotes in their comments)", () => {
  const widget = readFileSync(
    path.join(process.cwd(), "public", "widgets", "site-survey-merged.html"), "utf8");

  // The honest scanner: understands line comments, block comments and strings.
  function realEnd(start) {
    let i = widget.indexOf("{", widget.indexOf(")", start)), depth = 0;
    const comments = [];
    for (let j = i; j < widget.length; j++) {
      const c = widget[j], n = widget[j + 1];
      if (c === "/" && n === "/") { const e = widget.indexOf("\n", j); comments.push(widget.slice(j, e < 0 ? widget.length : e)); j = e < 0 ? widget.length : e; continue; }
      if (c === "/" && n === "*") { const e = widget.indexOf("*/", j + 2); comments.push(widget.slice(j, e < 0 ? widget.length : e + 2)); j = (e < 0 ? widget.length : e + 1); continue; }
      if (c === '"' || c === "'" || c === "`") { const q = c; for (j++; j < widget.length; j++) { if (widget[j] === "\\") { j++; continue; } if (widget[j] === q) break; } continue; }
      if (c === "{") depth++; else if (c === "}" && --depth === 0) return { end: j, comments };
    }
    return { end: -1, comments };
  }
  // The naive scanner the test extractors actually use.
  function naiveEnd(start) {
    let i = widget.indexOf("{", widget.indexOf(")", start)), depth = 0, q = null;
    for (let j = i; j < widget.length; j++) {
      const c = widget[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "{") depth++; else if (c === "}" && --depth === 0) return j;
    }
    return -1;
  }

  // The functions the survey tests extract today. Add a name here when a test starts extracting it.
  const NAMES = ["placeAt", "arm", "disarm", "select", "showDevCtx", "undoAction", "redoAction",
    "addDevice", "addUnplacedCamera", "reAdd", "removeDevice", "undoDeleteDevice", "cutRunsFor",
    "restoreRuns", "stripDevs", "deleteFloor", "pushServer", "floorsBefore", "maxOrd", "ordFromTag",
    "ordFromName", "nextGroupOrd", "nextTypeOrd", "pSnap", "pHistReset", "pHistPush", "pCanUndo",
    "pCanRedo", "pApply", "pHistUndo", "pHistRedo", "rtTap", "rtCommit", "rtDevKey", "rtHeadMoveTo"];

  const bad = [];
  for (const name of NAMES) {
    const start = widget.indexOf("function " + name + "(");
    if (start < 0) { bad.push(`${name}: not found in the widget`); continue; }
    const real = realEnd(start), naive = naiveEnd(start);
    if (real.end !== naive) {
      const culprit = real.comments.find((c) => /['"]/.test(c));
      bad.push(`${name}: the brace extractor overruns by ${naive - real.end} chars` +
        (culprit ? ` — a quote in this comment: ${culprit.trim().slice(0, 90)}` : ""));
    }
  }
  assert.deepEqual(bad, [], `${bad.length} function(s) are a trap for the test extractors:\n  ${bad.join("\n  ")}`);
});
