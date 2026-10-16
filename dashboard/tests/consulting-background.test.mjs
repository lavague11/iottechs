// Consulting reorg — Background storage + versioning contract.
// P1: the survey widget offloads every background/aerial image to /api/media so the survey2 blob keeps
// only a small URL (not a multi-MB inline data: URL that blows the 8 MB blob / localStorage budget and
// makes version history impossible). uploadBackground() posts kind:"survey-bg"; the media route must
// accept it. These two source-reads lock that alignment so neither side can silently re-break it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toolFingerprint } from "../lib/tool-data.js";

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

// ---- P3: non-destructive background/aerial versioning ---------------------------------------------
// THE fingerprint-safety proof: adding version history (bgVersions/ctxVersions/bgActive/ctxActive) to a
// floor must NOT change the survey2 fingerprint — otherwise history would silently void a customer's
// approval. survey2Meaning hashes f.bg CONTENT + device geometry only; the version arrays are invisible.
test("version history is fingerprint-invisible — adding it never voids a survey approval", () => {
  const floor = { name: "Exterior", bg: "/api/media/aaa", devices: [{ k: "cam", x: 10, y: 20, aim: 90, fov: 60, range: 40, name: "Drive" }], ctx: { src: "/api/media/ctx", rect: { x: 0, y: 0, w: 1, h: 1 } }, planSvg: "data:image/svg+xml,x", bgCtx: true };
  const base = JSON.stringify({ floors: [structuredClone(floor)], submitted: true });
  const withVersions = JSON.stringify({ floors: [Object.assign(structuredClone(floor), {
    bgVersions: [{ id: "bv_1", src: "/api/media/aaa", kind: "original", createdAt: 1, pinned: true }, { id: "bv_2", src: "/api/media/bbb", kind: "enhanced", createdAt: 2 }],
    ctxVersions: [{ id: "cv_1", src: "/api/media/ctx", kind: "original", createdAt: 1 }],
    bgActive: "bv_1", ctxActive: "cv_1",
  })], submitted: true });
  assert.equal(toolFingerprint("survey2", withVersions), toolFingerprint("survey2", base), "version arrays must not move the survey2 fingerprint");
});

test("switching the ACTIVE background (f.bg content changes) DOES move the fingerprint — a real change", () => {
  const mk = (bg) => JSON.stringify({ floors: [{ name: "F", bg, devices: [] }], submitted: true });
  assert.notEqual(toolFingerprint("survey2", mk("/api/media/aaa")), toolFingerprint("survey2", mk("/api/media/bbb")), "a different active background is a real change and re-arms approval");
});

// Replicate the widget's pushVersion ring buffer + pin logic and prove the invariants.
function pushVersion(f, listKey, activeKey, ver, MAX = 5) {
  const list = Array.isArray(f[listKey]) ? f[listKey] : [];
  for (const v of list) if (v.src === ver.src) { f[activeKey] = v.id; f[listKey] = list; return v.id; }
  if (!list.length) ver.kind = "original";
  list.push(ver); f[activeKey] = ver.id;
  const derived = list.filter((v) => v.kind !== "original");
  while (derived.length > MAX) { const victim = derived.find((v) => !v.pinned && v.id !== f[activeKey]); if (!victim) break; list.splice(list.indexOf(victim), 1); derived.splice(derived.indexOf(victim), 1); }
  f[listKey] = list; return ver.id;
}
test("ring buffer: original is permanent, keeps newest 5 derived, pinned exempt, dedupe re-activates", () => {
  const f = {};
  pushVersion(f, "bgVersions", "bgActive", { id: "o", src: "s0" });
  assert.equal(f.bgVersions[0].kind, "original", "first recorded is the permanent original");
  for (let i = 1; i <= 8; i++) pushVersion(f, "bgVersions", "bgActive", { id: "d" + i, src: "s" + i, kind: "enhanced" });
  const ids = f.bgVersions.map((v) => v.id);
  assert.ok(ids.includes("o"), "original never evicted");
  assert.equal(f.bgVersions.filter((v) => v.kind !== "original").length, 5, "only newest 5 derived kept");
  assert.deepEqual(f.bgVersions.filter((v) => v.kind !== "original").map((v) => v.id), ["d4", "d5", "d6", "d7", "d8"], "oldest derived evicted first");
  assert.equal(f.bgActive, "d8", "active is the latest");
  // pin an old one, push more → pinned survives
  const f2 = {}; pushVersion(f2, "bgVersions", "bgActive", { id: "o", src: "s0" });
  for (let i = 1; i <= 5; i++) pushVersion(f2, "bgVersions", "bgActive", { id: "d" + i, src: "s" + i, kind: "enhanced" });
  f2.bgVersions.find((v) => v.id === "d1").pinned = true;
  for (let i = 6; i <= 9; i++) pushVersion(f2, "bgVersions", "bgActive", { id: "d" + i, src: "s" + i, kind: "enhanced" });
  assert.ok(f2.bgVersions.some((v) => v.id === "d1"), "a pinned derived version is exempt from eviction");
  // dedupe: pushing an existing src just re-activates it, no duplicate
  const before = f2.bgVersions.length; pushVersion(f2, "bgVersions", "bgActive", { id: "x", src: "s0" });
  assert.equal(f2.bgVersions.length, before, "dedupe: no duplicate for an existing src");
  assert.equal(f2.bgActive, "o", "dedupe re-activates the existing version");
});

test("widget wiring: versions recorded at every background/ctx commit, pinned on submit, validated on restore", () => {
  const survey = read("public/widgets/site-survey-merged.html");
  // finishBackground now uploads the committed bg to a URL first, then records the version with that URL
  // (never a multi-MB inline blob) — so the survey2 blob stays small and always saves.
  assert.ok(survey.includes('recordBgVersion(_cf, url, "enhanced")') || survey.includes('recordBgVersion(_cf, _bg, "enhanced")'), "finishBackground records a bg version (from the uploaded URL)");
  assert.ok(survey.includes('f.ctx=cx; f.outlineDraft=null; recordCtxVersion(f, "original")'), "Create Floor Plan records the ctx original");
  assert.ok(survey.includes('f.ctx=swapped; recordCtxVersion(f, "enhanced")'), "the enhanced-aerial swap records a ctx version");
  assert.ok(/floors\[curFloor\]\.ctx=validCtx\(ev\.data\.ctx\); recordCtxVersion\(floors\[curFloor\], "original"\)/.test(survey), "the outline handoff records the ctx original");
  assert.ok(survey.includes("snapFloor(); pinAllFloorsActiveVersions(); submitted=true;"), "submit pins every floor's active versions");
  assert.ok(survey.includes("bgVersions:validVersions(f.bgVersions),ctxVersions:validVersions(f.ctxVersions),bgActive:"), "restore validates the version arrays");
});

// P3b: the restore picker — a thumbnail strip in the ••• sheet to switch the active version, no AI re-run.
test("restore picker: version section + thumbnails + restoreVersion wired (hybrid swaps ctx.src, plain swaps bg)", () => {
  const survey = read("public/widgets/site-survey-merged.html");
  assert.ok(survey.includes('<div class="moreSec" id="moreVersSec"'), "the Versions section exists in the ••• sheet");
  assert.ok(survey.includes('id="moreVersList"'), "the thumbnail container exists");
  assert.ok(survey.includes("function renderVersionPicker("), "buildMoreSheet renders the picker");
  assert.ok(survey.includes("renderVersionPicker(f, cap); }"), "buildMoreSheet calls renderVersionPicker");
  assert.ok(/vi\.list\.length<2\)\{ sec\.style\.display="none"/.test(survey), "picker hidden until 2+ versions exist");
  assert.ok(survey.includes("function restoreVersion("), "restoreVersion exists");
  assert.ok(/if\(vi\.key==="ctx" && f\.ctx\)\{ f\.ctxActive=id; f\.ctx\.src=ver\.src; \}/.test(survey), "hybrid restore swaps ONLY ctx.src");
  assert.ok(/else \{ f\.bgActive=id; f\.bg=ver\.src; bgData=ver\.src; \}/.test(survey), "plain restore swaps f.bg");
  assert.ok(survey.includes("restoreVersion(b.getAttribute(\"data-vid\"))"), "thumbnail click restores that version");
});
