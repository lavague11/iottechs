// Survey blob bloat fix: inline images (incl. the bg/aerial VERSION HISTORY) migrate to /api/media URLs
// so the blob stays under the ~5MB localStorage quota and the 8MB server cap. The one FINGERPRINTED
// image (f.bg) is only migrated while unsubmitted, so approvals never void.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const toolData = readFileSync(new URL("../lib/tool-data.js", import.meta.url), "utf8");

test("reclaim migrates the bg/aerial version history (the missed bloat) to /api/media", () => {
  const fn = widget.slice(widget.indexOf("function reclaimInlineImages"), widget.indexOf("function flushNow"));
  assert.ok(/\["bgVersions","ctxVersions"\]\.forEach/.test(fn), "scans bgVersions + ctxVersions");
  assert.ok(fn.includes('v.src.indexOf("data:")===0'), "only inline version srcs are migrated");
  assert.ok(fn.includes("v.src=u"), "the version src is replaced with the /api/media URL");
});

test("the fingerprinted f.bg is only migrated while UNSUBMITTED (approval safety)", () => {
  const fn = widget.slice(widget.indexOf("function reclaimInlineImages"), widget.indexOf("function flushNow"));
  assert.ok(fn.includes('if(!submitted && typeof f.bg==="string"'), "f.bg task guarded by !submitted");
  // confirm f.bg really is the fingerprinted field (so the guard is load-bearing)
  assert.ok(toolData.includes("bg: f?.bg ? hash(String(f.bg)) : null"), "survey2Meaning hashes f.bg");
});

test("bloated blobs self-heal: restore() proactively reclaims on load (staff only)", () => {
  assert.ok(widget.includes("if(!RO) setTimeout(reclaimInlineImages, 800)"), "proactive reclaim after load, office only");
});

test("server rejects >8MB payloads — so shrinking the blob also prevents silent save loss", () => {
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  assert.ok(/data\.length > 8_000_000/.test(route), "tool-data caps at 8MB");
});

test("versions never persist inline — recordBgVersion/recordCtxVersion upload first, store the URL", () => {
  const rb = widget.slice(widget.indexOf("function recordBgVersion"), widget.indexOf("function pinActiveVersions"));
  assert.ok(/uploadBackground\(src, function\(url\)\{[^}]*pushVersion/.test(rb.replace(/\n/g, " ")), "bg version uploads before recording the URL");
  assert.ok(rb.includes('recordCtxVersion'), "recordCtxVersion present");
  assert.ok(/pushVersion\(f, "ctxVersions", "ctxActive", o\)/.test(rb), "ctx version records a URL object");
});

test("finishBackground uploads the committed bg to a URL so the blob (with devices) stays saveable", () => {
  const fb = widget.slice(widget.indexOf("function finishBackground"), widget.indexOf("function saveToLibrary"));
  assert.ok(fb.includes("uploadBackground(_bg, function(url)"), "committed bg is uploaded to /api/media");
  assert.ok(fb.includes("_cf.bg=url"), "active bg becomes the URL (no multi-MB inline in the saved blob)");
});

test("cameras always reach the server: save() pushes to the server, failures surface (debounced)", () => {
  assert.ok(widget.includes("if(json) pushServer(json);"), "save() always pushes to the server (not only on cache-fail)");
  assert.ok(widget.includes("serverSaveState(!(j&&j.error))"), "server reject / network error is detected");
  assert.ok(widget.includes("setTimeout(function(){ _srvFailT=null; saveErr(true); }, 2500)"), "a genuine failure surfaces (debounced, so transient upload rejects don't flash)");
});
