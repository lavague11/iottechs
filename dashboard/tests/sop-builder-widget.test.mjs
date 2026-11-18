// SOP Builder widget — source assertions (house style): per-step media, Aim panel, auto-tag, icon rule, file size.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../app/tools/sop-builder");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const main = read("sop-builder.jsx");
const card = read("sop-step-card.jsx");
const sheets = read("sop-sheets.jsx");
const widgetFiles = ["sop-builder.jsx", "sop-builder-css.js", "sop-media.js", "sop-step-card.jsx", "sop-sheets.jsx", "sop-icons.jsx"];

const fnBody = (src, sig) => {
  const i = src.indexOf(sig);
  assert.ok(i >= 0, `${sig} exists`);
  const rest = src.slice(i + sig.length);
  const m = rest.search(/\n  (async function|function|const) /);
  return rest.slice(0, m < 0 ? rest.length : m);
};

test("setStepMedia awaits the uploads before patching the step with stored URLs only", () => {
  const b = fnBody(main, "async function setStepMedia(");
  const patchAt = b.indexOf("patchSop(");
  assert.ok(patchAt > 0, "patches the step");
  for (const call of ["await uploadMedia(", "await uploadFileRaw("]) {
    const at = b.indexOf(call);
    assert.ok(at >= 0 && at < patchAt, `${call} happens before patchSop`);
  }
  assert.ok(/await photoFrom\(/.test(b) && /await videoPoster\(/.test(b));
  assert.ok(/"photo\.heic"/.test(b) && /"clip\.mp4"/.test(b));
  assert.ok(!/dataUrl|\bd\b\s*[,}]/.test(b.slice(patchAt)), "the decoded data URL never reaches the patch");
  assert.ok(/Couldn't add that file\./.test(b), "failure toast");
});

test("replacing media resets the enhanced version", () => {
  const b = fnBody(main, "async function setStepMedia(");
  assert.ok(/enh: null, useEnh: false, note: ""/.test(b));
});

test("clearStepMedia clears all four fields and offers Undo restoring them", () => {
  const b = fnBody(main, "function clearStepMedia(");
  assert.ok(/img: null, enh: null, useEnh: false, video: null/.test(b));
  assert.ok(/label: "Undo"/.test(b) && /\.\.\.prev/.test(b));
});

test("step card: label-wrapped hidden file input with Photo / Replace / Remove / More", () => {
  assert.ok(/<label className="sopb-fl"/.test(card));
  assert.ok(/accept=\{ACCEPT\}/.test(card) && /video\/\*/.test(card) && /\.heic/.test(card));
  for (const w of ["Photo", "Replace", "Remove", "Uploading…", "Aim", "Redo", "Enhance"]) assert.ok(card.includes(w), w);
  assert.ok(/aria-label="More" title="More"/.test(card));
  assert.ok(/data-i=\{i\}/.test(card) && /className="sopb-step"/.test(card) && /sopb-h/.test(card), "drag-reorder DOM contract");
});

test("Aim panel edits target and where through editStep (onEdit) and runs enhance/redo", () => {
  assert.ok(/onEdit\(s\.id, "target"/.test(card));
  assert.ok(/onEdit\(s\.id, "where"/.test(card));
  assert.ok(/placeholder="Target"/.test(card) && /placeholder="Where"/.test(card) && /placeholder="Tweak"/.test(card));
  assert.ok(/s\.enh \? "Redo" : "Enhance"/.test(card));
  assert.ok(/onEdit=\{editStep\}/.test(main));
  assert.ok(/runEnhance\(\[st\], note, force\)/.test(main));
});

test("library auto-tag uses /api/sop/tags and the untagged count", () => {
  assert.ok(/\/api\/sop\/tags/.test(main));
  assert.ok(/r\.untagged/.test(main));
  assert.ok(/k < 8/.test(main));
  assert.ok(/untagged > 0/.test(sheets) && /Auto-tag/.test(sheets) && /Tagging…/.test(sheets));
  const tagFn = fnBody(main, "async function autoTag(");
  assert.ok(!/getSopAction/.test(tagFn), "no refetch; tags merged per round");
  assert.ok(/j\.written/.test(tagFn) && /patchSop\(/.test(tagFn), "written merged each round");
});

test("no emoji or glyph icons remain (the ↳ divider prefix is data and allowed)", () => {
  const bad = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u2261\u25A0-\u25FF\u2713\u2715\uFF0B\u21BA\u2935\u229E]/u;
  for (const f of widgetFiles) {
    const src = read(f).replace(/↳/g, "");
    const m = src.match(bad);
    assert.ok(!m, `${f} contains glyph icon ${m && m[0]}`);
  }
  assert.ok(/title: `↳ \$\{/.test(main), "divider prefix kept");
});

test("keep files under 500 lines", () => {
  for (const f of widgetFiles) {
    const n = read(f).split("\n").length;
    assert.ok(n <= 500, `${f} is ${n} lines`);
  }
  assert.ok(main.split("\n").length <= 500);
});

test("a late enhance only lands on the step that still has the same original photo", () => {
  const b = fnBody(main, "async function runEnhance(");
  assert.ok(/x\.id === s\.id && x\.img === s\.img && !x\.video/.test(b));
  assert.ok(/throw new Error\("Couldn't save the enhanced photo\."\)/.test(b));
});

test("no data: URL fallbacks are stored in steps", () => {
  for (const f of widgetFiles) {
    const src = read(f);
    assert.ok(!/\|\| j\.b64/.test(src), `${f}: no || j.b64`);
    assert.ok(!/\|\| ph\.dataUrl/.test(src) && !/ph\.url \|\| ph\.dataUrl\)/.test(src), `${f}: no ph.dataUrl fallback`);
  }
  const b = fnBody(main, "async function build(");
  assert.ok(/photosRef\.current\.find/.test(b) && /await uploadMedia\(ph\.dataUrl\)/.test(b));
  assert.ok(/Couldn't save \$\{lost\} file/.test(b));
});

test("patchSop skips the autosave when the updater returns the same reference", () => {
  assert.ok(/if \(next && next !== prev\) saveDraftSoon\(next\)/.test(main));
});

test("library: newest response wins, refresh uses the latest query", () => {
  assert.ok(/libSeq\.current/.test(main) && /my !== libSeq\.current/.test(main));
  assert.ok(/runLibSearch\(libQRef\.current\)/.test(main));
});

test("step card: dividers get no media or tags; media locked while busy; short placeholders", () => {
  assert.ok(/import \{ isDividerTitle, SHOT_KINDS, SHOT_KIND_LABEL \} from "..\/..\/..\/lib\/sop-model"/.test(card));
  assert.ok(/!divider && <input className="sopb-tagin"/.test(card));
  assert.ok(/aria-disabled=\{locked/.test(card) && /disabled=\{busy\}/.test(card));
  assert.ok(/placeholder="Tags"/.test(card) && /placeholder="Search"/.test(sheets));
  assert.ok(!/initialSop/.test(main));
});

test("tags field keeps raw text while editing and resets on blur", () => {
  assert.ok(/useState\(null\)/.test(card) && /tagText/.test(card));
  assert.ok(/value=\{tagText \?\? \(s\.tags \|\| \[\]\)\.join\(", "\)\}/.test(card));
  assert.ok(/onBlur=\{\(\) => setTagText\(null\)\}/.test(card));
  assert.ok(/setTagText\(e\.target\.value\); onEdit\(s\.id, "tags"/.test(card), "still autosaves split tags");
});

test("build waits for in-flight clips, caches uploads per photo, and counts lost files", () => {
  const b = fnBody(main, "async function build(");
  assert.ok(/p\.isVideo && !p\.video && !p\.failed/.test(b) && /Uploading video…/.test(b) && /sleep\(500\)/.test(b) && /120000/.test(b));
  assert.ok(/urlById\.has\(ph\.id\)/.test(b) && /new Map\(\)/.test(b));
  assert.ok(/ph\.isVideo \? !ph\.video : !img/.test(b));
  assert.ok(/failed: true/.test(main), "failed clip tiles are marked finished");
  assert.ok(/file\$\{lost === 1/.test(b) && !/photo\$\{lost/.test(b));
});

test("Build runs the enhancement it just chose, without risking the built guide", () => {
  const b = read("sop-builder.jsx");
  const build = b.slice(b.indexOf("async function build()"), b.indexOf("async function runEnhance"));
  // The guide is put in state AND queued to save BEFORE enhancing, so a dead key or an out-of-credits
  // account costs the enhancement only — the steps survive.
  const save = build.indexOf("saveDraftSoon(next)");
  const enh = build.indexOf("await runEnhance(toEnhance)");
  assert.ok(save > -1 && enh > -1, "build saves and then enhances");
  assert.ok(save < enh, "the built guide is saved before any enhancement runs");
  // Videos are never sent to the image editor, and a photoless build doesn't fire a pointless call.
  assert.match(build, /steps\.filter\(\(s\) => s\.img && !s\.video\)/);
  assert.match(build, /if \(!toEnhance\.length\)/, "no photos → no enhance call");
  // Awaited, so Build stays disabled for the whole run rather than re-arming mid-enhance.
  assert.match(build, /else await runEnhance\(toEnhance\);/);
});
