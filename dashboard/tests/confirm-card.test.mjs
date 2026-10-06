// In-product confirm card replaces window.confirm in the draw-floorplan widget.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

test("draw-floorplan: no native confirm, #confirmCard + askConfirm exist, inline script parses", () => {
  assert.ok(!/window\.confirm\(|[^.\w]confirm\(/.test(draw.replace(/askConfirm\(|closeConfirm\(/g, "")), "native confirm() is gone");
  assert.match(draw, /id="confirmCard"/);
  assert.match(draw, /function askConfirm\(/);
  const scripts = [...draw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) assert.doesNotThrow(() => new Function(s), "inline script parses");
});

test("askConfirm resolves exactly once; Yes/No route to the right callback; a second ask closes the first as No", () => {
  const els = {};
  const mk = () => { const cls = new Set(); return { textContent: "", className: "", style: {}, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) }, focus() {} }; };
  for (const id of ["confirmCard", "ccT", "ccB", "ccOk", "ccNo"]) els[id] = mk();
  const $ = (id) => els[id];
  const src = "var _cc=null;\n" + extractFn(draw, "closeConfirm") + "\n" + extractFn(draw, "askConfirm") + "\nreturn {askConfirm:askConfirm, closeConfirm:closeConfirm};";
  const api = new Function("$", src)($);
  const log = [];
  api.askConfirm({ title: "T", body: "B", ok: "Replace" }, () => log.push("yes"), () => log.push("no"));
  assert.equal(els.ccT.textContent, "T"); assert.equal(els.ccOk.textContent, "Replace");
  assert.ok(els.confirmCard.classList.has("on"));
  api.closeConfirm(true); api.closeConfirm(false); api.closeConfirm(true);
  assert.deepEqual(log, ["yes"], "resolves once");
  assert.ok(!els.confirmCard.classList.has("on"), "hidden after a choice");
  api.askConfirm({ title: "A" }, () => log.push("a-yes"), () => log.push("a-no"));
  api.askConfirm({ title: "B", danger: true }, () => log.push("b-yes"), () => log.push("b-no"));
  assert.deepEqual(log, ["yes", "a-no"], "a re-entrant ask resolves the open one as No");
  assert.equal(els.ccOk.className, "danger");
  api.closeConfirm(false);
  assert.deepEqual(log, ["yes", "a-no", "b-no"]);
});

test("seed + late-reply call sites continue in callbacks (no synchronous gate)", () => {
  const init = extractFn(draw, "initWithPlan");
  assert.match(init, /askConfirm\(\{title:"Replace structure\?"[^]*?\}, seed, finish\)/, "seed: Yes → seed(), No → finish() (keep structure)");
  assert.match(init, /else seed\(\)/, "no existing structure → seed without asking");
  assert.match(init, /if\(!S\|\|!S\.pts\|\|S\.pts\.length<3\)\{ finish\(\); return; \}/, "no/invalid seed → plain resolution");
  assert.match(draw, /askConfirm\(\{title:"Replace changes\?"[^]*?\}, accept, function\(\)\{ persist\(\); flushPlan\(\); \}\)/, "late reply: Yes → accept, No → keep local");
});
