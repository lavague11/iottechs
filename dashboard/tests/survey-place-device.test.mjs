// placeAt — EXECUTED, not source-matched.
//
// This exists because of a regression I shipped: a `//` comment appended to the guard line swallowed
// the rest of that line, including `var p=planPctFromClient(cx,cy)`. The file still parsed, every
// existing test still passed — they assert the guard's SHAPE (/\|\|routing\) return;/) — and device
// placement was completely broken in production: placeAt threw `ReferenceError: p is not defined`, so
// no camera, NVR or anything else could be added to any survey.
//
// A test that reads the code could not catch that. This one calls placeAt and checks a device arrives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
function extractFn(name) {
  const start = survey.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing " + name);
  let i = survey.indexOf("{", survey.indexOf(")", start)), depth = 0, q = null;
  for (let j = i; j < survey.length; j++) { const c = survey[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return survey.slice(start, j + 1); }
  throw new Error("unbalanced " + name);
}

// placeAt's real body, with its collaborators stubbed so the call is observable.
function run(opts) {
  const S = { armedK: "cam", routing: false, regionMode: false, aligning: false, frozen: false,
    added: [], projected: false, menuClosed: false, ...opts };
  const fn = new Function("S", `
    var armedK=S.armedK, routing=S.routing, regionMode=S.regionMode, aligning=S.aligning;
    function frozen(){ return S.frozen; }
    function planPctFromClient(cx,cy){ S.projected=true; return { x: cx/10, y: cy/10 }; }
    function addDevice(k,x,y){ S.added.push({k:k,x:x,y:y}); }
    var devMenu={ classList:{ remove:function(){ S.menuClosed=true; } } };
    ${extractFn("placeAt")}
    return placeAt;
  `)(S);
  return { call: fn, S };
}

test("placeAt ADDS a device — the projection runs and is not commented out", () => {
  const { call, S } = run({ armedK: "nvr" });
  call(700, 360);                       // this threw ReferenceError before the fix
  assert.equal(S.added.length, 1, "a device was added");
  assert.deepEqual(S.added[0], { k: "nvr", x: 70, y: 36 }, "with the PROJECTED coordinates, not the raw client ones");
  assert.equal(S.projected, true, "planPctFromClient actually ran");
  assert.equal(S.menuClosed, true, "and the palette closed behind it");
});

test("a camera places the same way", () => {
  const { call, S } = run({ armedK: "cam" });
  call(120, 240);
  assert.deepEqual(S.added, [{ k: "cam", x: 12, y: 24 }]);
});

test("every guard still refuses, and refusing adds nothing", () => {
  for (const [label, opts] of [
    ["nothing armed", { armedK: null }],
    ["submitted / read-only", { frozen: true }],
    ["region editor up", { regionMode: true }],
    ["aligning", { aligning: true }],
    ["on the Route step", { routing: true }],
  ]) {
    const { call, S } = run(opts);
    call(700, 360);
    assert.equal(S.added.length, 0, `${label}: no device placed`);
    assert.equal(S.projected, false, `${label}: it returned before projecting`);
  }
});

test("no comment on a guard line has swallowed the code after it", () => {
  // The shape of the bug: a replacement that matched up to `return;` and appended a `//` comment,
  // while real code continued on the same line. Both guards are written with the comment LAST.
  const place = extractFn("placeAt");
  assert.ok(/var p=planPctFromClient\(cx,cy\);/.test(place), "the projection is live code, not comment text");
  assert.ok(!/\/\/[^\n]*var p=/.test(place), "…and is not sitting inside a comment");
  // The sibling pointer guard uses the same shape — it must not regress the same way either.
  const ptr = survey.slice(survey.indexOf("if(frozen()||!armedK||inChrome(e)||regionMode||routing) return;"));
  assert.ok(/return;\s*\/\/[^\n]*\n/.test(ptr), "the pointer guard's comment ends its line");
  assert.ok(!/\/\/[^\n]*(placeAt\(e\.clientX|var )/.test(ptr.slice(0, 200)), "nothing executable is inside that comment");
});
