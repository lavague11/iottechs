// Consulting reorg — Background storage + versioning contract.
// P1: the survey widget offloads every background/aerial image to /api/media so the survey2 blob keeps
// only a small URL (not a multi-MB inline data: URL that blows the 8 MB blob / localStorage budget and
// makes version history impossible). uploadBackground() posts kind:"survey-bg"; the media route must
// accept it. These two source-reads lock that alignment so neither side can silently re-break it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("uploadBackground posts kind:'survey-bg' and the media route accepts it", () => {
  const survey = read("public/widgets/site-survey-merged.html");
  const route = read("app/api/media/route.js");
  assert.ok(/fd\.append\("kind","survey-bg"\)/.test(survey), "uploadBackground still posts kind 'survey-bg'");
  const kindsLine = (route.match(/const PROJECT_KINDS = new Set\(\[[^\]]*\]\)/) || [""])[0];
  assert.ok(/"survey-bg"/.test(kindsLine), "/api/media PROJECT_KINDS must include 'survey-bg' (else uploadBackground 400s → inline data: URL bloat)");
});

// P2: Edit background on a satellite floor must reopen ON the persisted enhanced/leveled aerial
// (iotLoadCapture with the stored src), not on a blank live-map crop (transform-only restore), so the
// enhanced image is never orphaned + re-billed. Hybrid floors still arm the ctx.src-only swap.
test("Edit background reopens the satellite on the stored enhanced image (not a blank crop)", () => {
  const survey = read("public/widgets/site-survey-merged.html");
  const i = survey.indexOf('getElementById("changeBgBtn").addEventListener');
  const h = survey.slice(i, i + 2200);
  const sat = h.slice(h.indexOf('curBgSource==="satellite"'));
  assert.ok(/var ebSrc=\(ebf&&\(\(ebf\.ctx&&ebf\.ctx\.src\)\|\|ebf\.bg\)\)/.test(sat), "feeds the floor's ctx.src || bg");
  assert.ok(/type:"iotLoadCapture", src:ebSrc, outlineOnly:false/.test(sat), "posts iotLoadCapture with the stored image, normal (non-outline) mode");
  assert.ok(/if\(hybridCapable\(ebf\)\) pendingCtxSwap=true;/.test(sat), "hybrid floor still arms the ctx.src-only enhanced swap");
  assert.ok(/else \{ postAerialRestore\(ebChg\); \}/.test(sat), "falls back to the transform-only restore when no image is stored");
  assert.ok(/satFrame\.addEventListener\("load", function h\(\)\{ satFrame\.removeEventListener\("load",h\); ebPost\(\); \}\); ebPost\(\);/.test(sat), "load-then-post pattern for a (re)loaded iframe");
});
