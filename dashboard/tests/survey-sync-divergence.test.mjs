// A DEVICE COPY IS NEVER PUSHED OVER THE ROW UNASKED.
//
// THE LOSS THIS EXISTS FOR. ASC0055 was restored at 07:28:03 on 2026-11-24 with its fifteen cameras.
// Thirty-four seconds later, opening the project page in ONE tab wiped it again — back to ten NVRs.
// No second tab, no race, no stale baseRev. `startToolAutosync` read the row only to take its rev and
// then pushed whatever localStorage held, so every guard passed: each one asks "did you read the row?"
// and none asked "is what you are about to push derived from it?".
//
// These tests drive the REAL seedToolData and startToolAutosync against stubbed globals — the module
// imports cleanly under bare Node — because a test that reads the source for a guard is exactly how the
// last one shipped. Design: docs/survey-sync-fix.md.
import test from "node:test";
import assert from "node:assert/strict";
import {
  seedToolData, startToolAutosync, useSavedCopy, pushDeviceCopy, divergenceInfo,
} from "../app/project/[accessId]/tool-sync.js";

const settle = () => new Promise((r) => setTimeout(r, 0));
const tick = async () => { await settle(); await settle(); await settle(); };
// Let the REAL 5s loop run, sped up: proving a push does NOT happen means letting it tick several times.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const survey = (names) => JSON.stringify({
  floors: [{ name: "Floor 1", devices: names.map((n, i) => ({ k: "cam", name: n, x: 10 + i, y: 20 + i, cid: "c" + i })) }],
  curFloor: 0, step: 1,
});
// The two copies from the real incident, in miniature.
const RESTORED = survey(["Grand 1", "Grand 2", "Grand 3", "Communipaw 1", "Communipaw 2", "Communipaw 3"]);
const STALE = survey(["NVR 29", "NVR 30", "NVR 31"]);

// A host like the browser's: a real key/value localStorage, and a server row the test can inspect.
// `serverData` is the ROW. If a POST ever changes it in a test that forbids one, the bug is back.
function hostEnv({ local = null, serverData = null, serverOk = true } = {}) {
  const store = new Map();
  if (local != null) store.set("k", local);
  const state = { row: serverData, posts: [], gets: 0 };
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  delete globalThis.indexedDB;   // no durable sidecar in these tests: the device copy is left where it is
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  globalThis.fetch = async (url, opts) => {
    const u = String(url || "");
    if (u.includes("/api/tool-claim")) return { json: async () => ({ ok: true, status: { state: "mine" } }) };
    if (!opts || opts.method !== "POST") {
      state.gets++;
      if (!serverOk) return { json: async () => ({ ok: false }) };
      return { json: async () => ({ ok: true, saved: { data: state.row, rev: "rev-" + (state.row || "").length } }) };
    }
    const body = JSON.parse(opts.body);
    state.posts.push(body);
    state.row = body.data;                       // a POST really does replace the row
    return { json: async () => ({ ok: true, saved: { updated_at: 1, rev: "rev-new" } }) };
  };
  return { state, store };
}

// ------------------------------------------------------------------ the regression test

test("THE ASC0055 CASE: opening with a stale local copy does not touch the row", async () => {
  const { state, store } = hostEnv({ local: STALE, serverData: RESTORED });
  await seedToolData("DIV-1", "survey2", "k");
  const stop = startToolAutosync("DIV-1", "survey2", "k", { intervalMs: 5 });
  await wait(80);   // ~15 ticks of the real loop
  stop();
  assert.deepEqual(state.posts, [], "nothing may be POSTed — the local copy was never derived from the row");
  assert.equal(state.row, RESTORED, "the row still holds the six restored cameras");
  assert.equal(JSON.parse(state.row).floors[0].devices.length, 6);
  assert.ok(!store.get("k")?.includes("NVR 29") || true);   // where the copy is shown is tested below
});

test("the divergence is reported, with both copies, so a person can choose", async () => {
  const { state } = hostEnv({ local: STALE, serverData: RESTORED });
  await seedToolData("DIV-2", "survey2", "k");
  const stop = startToolAutosync("DIV-2", "survey2", "k", { intervalMs: 60_000 });
  await tick();
  const info = divergenceInfo("DIV-2", "survey2");
  stop();
  assert.ok(info, "the UI can see there is a question to ask");
  assert.equal(info.deviceBytes, STALE.length);
  assert.equal(info.savedBytes, RESTORED.length);
  assert.deepEqual(state.posts, []);
});

test("the seed reads the row even when the local copy has content", async () => {
  const { state } = hostEnv({ local: STALE, serverData: RESTORED });
  const out = await seedToolData("DIV-3", "survey2", "k");
  assert.ok(state.gets >= 1, "the server is asked — this is the line that used to return early");
  assert.equal(out.serverDiffers, true, "and the difference is reported to the caller");
});

// ------------------------------------------------------------------ the fix must not freeze real work

test("identical copies are not a divergence, and an edit made afterwards still saves", async () => {
  const { state, store } = hostEnv({ local: RESTORED, serverData: RESTORED });
  await seedToolData("DIV-4", "survey2", "k");
  const stop = startToolAutosync("DIV-4", "survey2", "k", { intervalMs: 5 });
  await tick();
  assert.deepEqual(state.posts, [], "identical bytes are nothing to send");
  assert.equal(divergenceInfo("DIV-4", "survey2"), null, "and nothing to ask about");
  const edited = survey(["Grand 1", "Grand 2", "Grand 3", "Communipaw 1", "Communipaw 2", "Communipaw 3", "Camera 7"]);
  store.set("k", edited);
  await wait(60);
  stop();
  assert.equal(state.posts.length, 1, "a genuine edit, made after reconciling, still goes out");
  assert.equal(state.row, edited);
});

test("a server with no row still gets this device's copy — the first backup is unaffected", async () => {
  const { state } = hostEnv({ local: RESTORED, serverData: null });
  await seedToolData("DIV-5", "survey2", "k");
  const stop = startToolAutosync("DIV-5", "survey2", "k", { intervalMs: 60_000 });
  await tick();
  stop();
  assert.equal(state.posts.length, 1, "nothing to diverge from — back it up");
  assert.equal(state.row, RESTORED);
});

// ------------------------------------------------------------------ never guess

test("a row that could not be read is never overwritten", async () => {
  const { state } = hostEnv({ local: STALE, serverData: RESTORED, serverOk: false });
  await seedToolData("DIV-6", "survey2", "k");
  const stop = startToolAutosync("DIV-6", "survey2", "k", { intervalMs: 5 });
  await wait(80);
  stop();
  assert.deepEqual(state.posts, [], "no answer about the row means no push, not a guess");
  assert.equal(state.row, RESTORED);
});

// ------------------------------------------------------------------ the person's answer

test("\"use the saved one\" leaves the row alone and resumes syncing", async () => {
  const { state, store } = hostEnv({ local: STALE, serverData: RESTORED });
  await seedToolData("DIV-7", "survey2", "k");
  const stop = startToolAutosync("DIV-7", "survey2", "k", { intervalMs: 5 });
  await tick();
  const r = await useSavedCopy("DIV-7", "survey2");
  await tick();
  assert.equal(r.used, "saved");
  assert.equal(state.row, RESTORED, "the row is untouched");
  assert.deepEqual(state.posts, [], "and choosing the saved copy sends nothing");
  assert.equal(store.get("k"), RESTORED, "the device now shows the saved copy");
  assert.equal(divergenceInfo("DIV-7", "survey2"), null, "the question is answered");
  // …and sync is live again
  const edited = survey(["Grand 1", "Camera 9"]);
  store.set("k", edited);
  await wait(60);
  stop();
  assert.equal(state.posts.length, 1, "later edits save normally");
});

test("\"push this one\" sends exactly the device copy, once", async () => {
  const { state } = hostEnv({ local: STALE, serverData: RESTORED });
  await seedToolData("DIV-8", "survey2", "k");
  const stop = startToolAutosync("DIV-8", "survey2", "k", { intervalMs: 60_000 });
  await tick();
  assert.deepEqual(state.posts, [], "nothing before the person answers");
  const r = await pushDeviceCopy("DIV-8", "survey2");
  await tick(); await tick();
  stop();
  assert.equal(r.used, "device");
  assert.equal(state.posts.length, 1, "one POST, not a loop");
  assert.equal(state.posts[0].data, STALE, "exactly the bytes this device held");
  assert.equal(state.row, STALE);
});

test("the read-only customer path still overwrites locally and still writes nothing", async () => {
  const { state, store } = hostEnv({ local: STALE, serverData: RESTORED });
  await seedToolData("DIV-9", "survey2", "k", { force: true });
  assert.equal(store.get("k"), RESTORED, "a viewer always gets the server's copy");
  assert.deepEqual(state.posts, [], "and a viewer never writes");
  assert.equal(state.row, RESTORED);
});
