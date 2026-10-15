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
