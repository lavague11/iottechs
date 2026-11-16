// Every .js/.jsx file under app/ and lib/ must parse with the SAME SWC transform
// Next uses to build. This project has no typecheck and no lint, so without this a
// syntax error in JSX passes the whole suite (no other test parses JSX) and only
// surfaces at `next build` — or, in dev, as a 500 on the page that imports it.
import test from "node:test";
import assert from "node:assert/strict";
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
