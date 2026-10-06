// Outline Building helpers (zoom/pan view, undo/redo + autosave, draft restore, message contract).
// The widget is single-file ES5 HTML with no exports, so — like pan-transform.test.mjs — we read the real source,
// extract the function bodies with a brace matcher and evaluate them against stubbed globals. If the widget drifts,
// these tests run the drifted code (or fail to find it).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../public/widgets/" + f, import.meta.url), "utf8");
const widget = read("satellite-capture.html");
const survey = read("site-survey-merged.html");

// Return the full text of `function name(...){...}` (brace-matched, string/comment tolerant enough for this widget).
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start));
  assert.ok(i > 0, "no body for " + name);
  let depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === "\\") j++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}
function extractVar(src, re, label) {
  const m = src.match(re);
  assert.ok(m, "widget is missing " + label);
  return m[0];
}

const trZDecl = extractVar(widget, /var trZ=\{[^}]*\};/, "var trZ={…}");
const FNS = ["norm", "trC2S", "trS2C", "trSnap", "trBtns", "trCapKey", "trCapMatch", "trDraftPost", "trPush", "trGo", "trUndo", "trRedo", "trLoadDraft"]
  .map((n) => extractFn(widget, n)).join("\n");

// One sandbox per test. `embedded` → window.parent !== window so the debounced autosave path runs.
const CAP = { center: { lat: 40.1, lng: -74.2 }, zoom: 20, rotationDeg: 12, rect: { x: 10, y: 20, w: 300, h: 200 }, stage: { w: 800, h: 600 } };
function sandbox({ embedded = false, tracing = true, capCanvas = {}, capAerial = CAP } = {}) {
  const posts = [], timers = new Map();
  let nextId = 1;
  const els = {};
  const $ = (id) => els[id] || (els[id] = { disabled: false });
  const win = {};
  win.parent = embedded ? { postMessage: (m) => posts.push(m) } : win;
  const calls = { paint: 0, sync: 0 };
  const factory = new Function(
    "$", "window", "parent", "PID", "setTimeout", "clearTimeout", "trPaint", "trSync", "preview", "capCanvas", "capAerial",
    `var tracePts=[], trClosed=false, trDrag=-1, trHover=-1, trSel=-1, trHist=[], trHi=-1, trSaveT=null, trDraftFid=null;
     ${trZDecl}
     ${FNS}
     return {
       get tracePts(){return tracePts;}, set tracePts(v){tracePts=v;},
       get trClosed(){return trClosed;}, set trClosed(v){trClosed=v;},
       get trSel(){return trSel;}, set trSel(v){trSel=v;},
       get trDrag(){return trDrag;}, set trDrag(v){trDrag=v;},
       get trHist(){return trHist;}, set trHist(v){trHist=v;},
       get trHi(){return trHi;}, set trHi(v){trHi=v;},
       get trZ(){return trZ;},
       trC2S:trC2S, trS2C:trS2C, trSnap:trSnap, trPush:trPush, trGo:trGo, trUndo:trUndo, trRedo:trRedo,
       trBtns:trBtns, trLoadDraft:trLoadDraft, trCapKey:trCapKey, trCapMatch:trCapMatch,
       get trDraftFid(){return trDraftFid;}, set trDraftFid(v){trDraftFid=v;}
     };`
  );
  const env = factory(
    $, win, win.parent, "P1",
    (fn) => { const id = nextId++; timers.set(id, fn); return id; },
    (id) => { timers.delete(id); },
    () => { calls.paint++; }, () => { calls.sync++; },
    { classList: { contains: () => tracing } }, capCanvas, capAerial
  );
  env.$ = $; env.posts = posts; env.calls = calls;
  env.pendingTimers = () => timers.size;
  env.flush = () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((f) => f()); };
  // start state mirrors enterTrace(): empty outline, one snapshot
  env.trHist = [env.trSnap()]; env.trHi = 0; env.trBtns();
  return env;
}
const add = (env, x, y) => { env.tracePts.push({ x, y }); env.trPush(); };

// ---------- zoom / pan view ----------
test("trC2S / trS2C: identity at s=1", () => {
  const e = sandbox();
  assert.deepEqual(e.trC2S({ x: 12, y: 34 }), { x: 12, y: 34 });
  assert.deepEqual(e.trS2C(12, 34), { x: 12, y: 34 });
});

test("trC2S applies scale then offset (s=2.5, tx/ty)", () => {
  const e = sandbox();
  Object.assign(e.trZ, { s: 2.5, tx: -30, ty: 14 });
  const s = e.trC2S({ x: 10, y: 20 });
  assert.equal(s.x, 10 * 2.5 - 30);
  assert.equal(s.y, 20 * 2.5 + 14);
});

test("trS2C is the exact inverse of trC2S (and vice versa) across views", () => {
  const e = sandbox();
  const views = [{ s: 1, tx: 0, ty: 0 }, { s: 2.5, tx: -120, ty: 45.5 }, { s: 6, tx: 300, ty: -77.25 }, { s: 1.37, tx: 0.5, ty: -0.5 }];
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 250 }, { x: 640.5, y: 480.25 }, { x: -20, y: 999 }, { x: 3.14159, y: 2.71828 }];
  for (const v of views) {
    Object.assign(e.trZ, v);
    for (const p of pts) {
      const back = e.trS2C(e.trC2S(p).x, e.trC2S(p).y);
      assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9, `content round-trip s=${v.s} p=(${p.x},${p.y})`);
      const s = e.trC2S(e.trS2C(p.x, p.y));
      assert.ok(Math.abs(s.x - p.x) < 1e-9 && Math.abs(s.y - p.y) < 1e-9, `screen round-trip s=${v.s} p=(${p.x},${p.y})`);
    }
  }
});

// ---------- undo / redo ----------
test("starts with one snapshot and both buttons disabled", () => {
  const e = sandbox();
  assert.equal(e.trHist.length, 1);
  assert.equal(e.trHi, 0);
  assert.equal(e.$("trUndo").disabled, true);
  assert.equal(e.$("trRedo").disabled, true);
});

test("3 pushes → hist length 4, hi 3; undo ×2 → 1 point; redo → 2 points", () => {
  const e = sandbox();
  add(e, 0.1, 0.1); add(e, 0.5, 0.1); add(e, 0.5, 0.5);
  assert.equal(e.trHist.length, 4);
  assert.equal(e.trHi, 3);
  assert.equal(e.tracePts.length, 3);
  e.trUndo(); e.trUndo();
  assert.equal(e.trHi, 1);
  assert.equal(e.tracePts.length, 1);
  assert.deepEqual(e.tracePts[0], { x: 0.1, y: 0.1 });
  e.trRedo();
  assert.equal(e.trHi, 2);
  assert.equal(e.tracePts.length, 2);
  assert.deepEqual(e.tracePts[1], { x: 0.5, y: 0.1 });
});

test("a push after undo truncates the redo branch", () => {
  const e = sandbox();
  add(e, 0.1, 0.1); add(e, 0.2, 0.2); add(e, 0.3, 0.3);
  e.trUndo(); e.trUndo();                 // at 1 point, two redo states ahead
  e.tracePts.push({ x: 0.9, y: 0.9 }); e.trPush();
  assert.equal(e.trHist.length, 3);       // [empty, 1pt, 2pt-new]
  assert.equal(e.trHi, 2);
  assert.equal(e.$("trRedo").disabled, true);
  e.trRedo();                              // no-op
  assert.equal(e.tracePts.length, 2);
  assert.deepEqual(e.tracePts[1], { x: 0.9, y: 0.9 });
});

test("history is capped at 100 entries (oldest dropped)", () => {
  const e = sandbox();
  for (let i = 0; i < 130; i++) add(e, (i % 100) / 100, 0.5);
  assert.equal(e.trHist.length, 100);
  assert.equal(e.trHi, 99);
  assert.equal(e.trHist[99].p.length, 130);   // latest snapshot intact
  assert.equal(e.trHist[0].p.length, 31);     // 131 snapshots − 100 → oldest kept is the 32nd (index 31 points)
});

test("undo at index 0 and redo at the end are no-ops", () => {
  const e = sandbox();
  e.trUndo();
  assert.equal(e.trHi, 0);
  assert.equal(e.tracePts.length, 0);
  add(e, 0.2, 0.2);
  const painted = e.calls.paint;
  e.trRedo();
  assert.equal(e.trHi, 1);
  assert.equal(e.tracePts.length, 1);
  assert.equal(e.calls.paint, painted, "redo past the end must not repaint");
});

test("undo/redo restore closed state and clear selection/drag", () => {
  const e = sandbox();
  add(e, 0.1, 0.1); add(e, 0.8, 0.1); add(e, 0.8, 0.8);
  e.trClosed = true; e.trPush();
  e.trSel = 1; e.trDrag = 2;
  e.trUndo();
  assert.equal(e.trClosed, false);
  assert.equal(e.trSel, -1);
  assert.equal(e.trDrag, -1);
  e.trRedo();
  assert.equal(e.trClosed, true);
  assert.equal(e.tracePts.length, 3);
});

test("button disabled state tracks availability", () => {
  const e = sandbox();
  add(e, 0.1, 0.1); add(e, 0.2, 0.2);
  assert.equal(e.$("trUndo").disabled, false);
  assert.equal(e.$("trRedo").disabled, true);
  e.trUndo();
  assert.equal(e.$("trUndo").disabled, false);
  assert.equal(e.$("trRedo").disabled, false);
  e.trUndo();
  assert.equal(e.$("trUndo").disabled, true);
  assert.equal(e.$("trRedo").disabled, false);
  e.trRedo(); e.trRedo();
  assert.equal(e.$("trUndo").disabled, false);
  assert.equal(e.$("trRedo").disabled, true);
});

test("undo/redo repaint and resync", () => {
  const e = sandbox();
  add(e, 0.1, 0.1);
  const p = e.calls.paint, s = e.calls.sync;
  e.trUndo();
  assert.equal(e.calls.paint, p + 1);
  assert.equal(e.calls.sync, s + 1);
});

test("snapshots are copies (mutating live points does not rewrite history)", () => {
  const e = sandbox();
  add(e, 0.1, 0.1);
  e.tracePts[0].x = 0.99;
  assert.equal(e.trHist[1].p[0][0], 0.1);
});

// ---------- debounced autosave ----------
test("standalone (window.parent === window): no timers, no posts", () => {
  const e = sandbox({ embedded: false });
  add(e, 0.1, 0.1); e.trUndo();
  assert.equal(e.pendingTimers(), 0);
  e.flush();
  assert.deepEqual(e.posts, []);
});

test("embedded: pushes debounce into one iotOutlineSave with the latest draft", () => {
  const e = sandbox({ embedded: true });
  add(e, 0.1, 0.2); add(e, 0.3, 0.4);
  assert.equal(e.pendingTimers(), 1, "second push replaces the first timer");
  assert.equal(e.posts.length, 0);
  e.flush();
  assert.equal(e.posts.length, 1);
  assert.deepEqual(e.posts[0], { type: "iotOutlineSave", project: "P1", fid: null, draft: { pts: [[0.1, 0.2], [0.3, 0.4]], closed: false, cap: CAP } });
});

test("embedded: every save carries the floor id and the capture key; clearing posts draft:null with the fid", () => {
  const e = sandbox({ embedded: true });
  e.trDraftFid = "fl_A";
  add(e, 0.1, 0.2);
  e.flush();
  assert.equal(e.posts[0].fid, "fl_A");
  assert.deepEqual(e.posts[0].draft.cap, CAP);
  e.trUndo(); e.flush();
  assert.deepEqual(e.posts[1], { type: "iotOutlineSave", project: "P1", fid: "fl_A", draft: null });
  const n = sandbox({ embedded: true, capAerial: null });
  add(n, 0.1, 0.2); n.flush();
  assert.equal(n.posts[0].draft.cap, null);
});

test("embedded: undoing back to an empty outline posts draft:null", () => {
  const e = sandbox({ embedded: true });
  add(e, 0.1, 0.2);
  e.flush(); e.posts.length = 0;
  e.trUndo();
  e.flush();
  assert.equal(e.posts.length, 1);
  assert.equal(e.posts[0].type, "iotOutlineSave");
  assert.equal(e.posts[0].draft, null);
});

// ---------- draft restore ----------
test("trLoadDraft: null / empty / malformed → no change", () => {
  const e = sandbox();
  add(e, 0.4, 0.4);
  const hist = e.trHist.length;
  for (const d of [null, undefined, {}, { pts: [] }, { pts: "x" }]) e.trLoadDraft(d);
  assert.equal(e.tracePts.length, 1);
  assert.equal(e.trHist.length, hist);
});

test("trLoadDraft: ignored when not tracing or there is no capture", () => {
  const a = sandbox({ tracing: false });
  a.trLoadDraft({ pts: [[0.1, 0.1]] });
  assert.equal(a.tracePts.length, 0);
  const b = sandbox({ capCanvas: null });
  b.trLoadDraft({ pts: [[0.1, 0.1]] });
  assert.equal(b.tracePts.length, 0);
});

test("trLoadDraft: closed needs ≥3 points", () => {
  const two = sandbox();
  two.trLoadDraft({ pts: [[0.1, 0.1], [0.9, 0.9]], closed: true });
  assert.equal(two.tracePts.length, 2);
  assert.equal(two.trClosed, false);
  const three = sandbox();
  three.trLoadDraft({ pts: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]], closed: true });
  assert.equal(three.trClosed, true);
  const open = sandbox();
  open.trLoadDraft({ pts: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]] });
  assert.equal(open.trClosed, false);
});

test("trLoadDraft: out-of-range / junk coords clamp to [0,1]", () => {
  const e = sandbox();
  e.trLoadDraft({ pts: [[-0.5, 1.7], [2, -3], ["0.25", "x"]] });
  assert.deepEqual(e.tracePts, [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0.25, y: 0 }]);
});

test("trLoadDraft: resets history to a single snapshot, selection cleared, buttons disabled", () => {
  const e = sandbox();
  add(e, 0.1, 0.1); add(e, 0.2, 0.2);
  e.trSel = 1;
  e.trLoadDraft({ pts: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], closed: true });
  assert.equal(e.trHist.length, 1);
  assert.equal(e.trHi, 0);
  assert.equal(e.trSel, -1);
  assert.equal(e.trHist[0].p.length, 3);
  assert.equal(e.trHist[0].c, true);
  assert.equal(e.$("trUndo").disabled, true);
  assert.equal(e.$("trRedo").disabled, true);
});

test("trLoadDraft: caps a draft at 500 points", () => {
  const e = sandbox();
  e.trLoadDraft({ pts: Array.from({ length: 800 }, (_, i) => [(i % 10) / 10, 0.5]) });
  assert.equal(e.tracePts.length, 500);
});

test("trLoadDraft: a draft keyed to a different capture is ignored; a matching or cap-less one loads", () => {
  const pts = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]];
  const clone = (o) => JSON.parse(JSON.stringify(Object.assign({}, CAP, o)));
  const mismatches = [
    { center: { lat: 40.1001, lng: -74.2 } }, { zoom: 19 }, { rotationDeg: 14 },
    { rect: { x: 12.5, y: 20, w: 300, h: 200 } }, { stage: { w: 800, h: 640 } },
  ];
  for (const m of mismatches) {
    const e = sandbox();
    e.trLoadDraft({ pts, closed: false, cap: clone(m) });
    assert.equal(e.tracePts.length, 0, "ignored: " + JSON.stringify(m));
    assert.equal(e.trHist.length, 1);
  }
  const nocap = sandbox({ capAerial: null });
  nocap.trLoadDraft({ pts, cap: clone({}) });
  assert.equal(nocap.tracePts.length, 0, "keyed draft with no current capture is ignored");
  const ok = sandbox();
  ok.trLoadDraft({ pts, cap: clone({ center: { lat: 40.1000004, lng: -74.2 }, rotationDeg: 12.4, rect: { x: 10.5, y: 20, w: 300, h: 200 } }) });
  assert.equal(ok.tracePts.length, 3, "within tolerance loads");
  const wrap = sandbox({ capAerial: Object.assign({}, CAP, { rotationDeg: 179.8 }) });
  wrap.trLoadDraft({ pts, cap: clone({ rotationDeg: -179.8 }) });
  assert.equal(wrap.tracePts.length, 3, "rotation compares across the ±180 wrap");
  const legacy = sandbox();
  legacy.trLoadDraft({ pts });
  assert.equal(legacy.tracePts.length, 3, "a cap-less (older) draft still loads");
});

// ---------- message contract (widget ⇄ survey host) ----------
test("widget speaks the iotOutline* protocol", () => {
  assert.ok(widget.includes('"iotOutlineSave"'), "iotOutlineSave");
  assert.ok(widget.includes('"iotOutlineReady"'), "iotOutlineReady");
  assert.ok(widget.includes('"iotOutlineLoad"'), "iotOutlineLoad");
});

test("applyAerial marks aerialApplied, and the initial search honours it", () => {
  assert.ok(extractFn(widget, "applyAerial").includes("aerialApplied=true;"), "applyAerial sets aerialApplied=true;");
  assert.ok(extractFn(widget, "search").includes("if(!(isInitial && (aerialApplied || loadedCapture)))"), "search skips the initial recenter when an aerial was restored (or a capture was loaded)");
});

test("floor routing: widget echoes fid, host replies with fid and routes saves by it", () => {
  assert.ok(widget.includes("fid:trDraftFid"), "saves carry fid");
  assert.ok(widget.includes("trDraftFid=d.fid||null"), "load stores fid");
  assert.ok(widget.includes("e.source!==window.parent"), "load listener checks the sender");
  assert.ok(survey.includes('type:"iotOutlineLoad", fid:(fl&&fl.id)||null'), "host load reply carries the floor id");
  assert.ok(survey.includes("f.id===m.fid"), "host resolves the save target by fid");
  assert.ok(survey.includes("if(bgToolSrc===SAT_SRC) bgToolSrc=null;"), "floor switch drops the stale satellite frame");
});

test("survey host persists the draft and answers with iotOutlineLoad", () => {
  assert.ok(survey.includes("outlineDraft:f.outlineDraft||null"), "outlineDraft carried per floor");
  assert.ok(survey.includes('type:"iotOutlineLoad"'), "host posts iotOutlineLoad");
});
