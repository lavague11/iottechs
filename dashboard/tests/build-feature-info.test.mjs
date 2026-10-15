// /build Features step: a click-popover ⓘ on every feature, independent of the checkbox.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../public/widgets/cctv-quote-calculator.html", import.meta.url),
  "utf8"
);

// the 11 security features shown on the Features step
const FEAT_IDS = [
  "rec247", "colornight", "hd4k", "mobile", "audio", "aidetect",
  "motionnotify", "facial", "lpr", "livemon", "alarm",
];

test("every security feature carries an info: description", () => {
  const block = src.slice(src.indexOf("securityFeatures: ["));
  for (const id of FEAT_IDS) {
    const line = block.split("\n").find((l) => l.includes(`id:'${id}'`));
    assert.ok(line, `feature ${id} present`);
    assert.ok(/\binfo:\s*'/.test(line), `feature ${id} has an info description`);
  }
});

test("the ⓘ icon routes to its own action and never toggles the checkbox", () => {
  // the info span is its own data-act, resolved before (and separate from) the feat toggle
  assert.ok(src.includes(`data-act="featinfo"`), "info icon uses data-act=featinfo");
  assert.ok(
    src.includes("case 'featinfo': openFeatPop(a, v); return;"),
    "featinfo opens the popover and returns (never falls through to 'feat')"
  );
  assert.ok(
    src.includes("aria-label=\"About ${f.label}\""),
    "info icon is labeled for screen readers"
  );
});

test("the popover closes on outside tap, Escape, scroll and resize", () => {
  assert.ok(
    src.includes(`if(featPopFor && !e.target.closest('#featPop') && !e.target.closest('[data-act="featinfo"]')) closeFeatPop();`),
    "outside-tap close guard present"
  );
  assert.ok(src.includes("if(e.key==='Escape' && featPopFor){ closeFeatPop(); return; }"), "Escape closes");
  assert.ok(src.includes("addEventListener('scroll', ()=>{ if(featPopFor) closeFeatPop(); }, true);"), "scroll closes");
  assert.ok(src.includes("addEventListener('resize', ()=>{ if(featPopFor) closeFeatPop(); });"), "resize closes");
});

test("alarm copy asks for emergency response, never promises police dispatch", () => {
  const line = src.split("\n").find((l) => l.includes("id:'alarm'"));
  assert.ok(line.includes("can request emergency response"), "uses the restrained wording");
  assert.ok(!/police dispatch|dispatch(es)? (the )?police|guaranteed/i.test(line), "no dispatch promise");
});
