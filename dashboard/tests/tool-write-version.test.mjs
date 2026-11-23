// B14 — a write must prove it is made against the version the caller read.
//
// The hole: an open tab pushes localStorage on a timer and nothing compares versions, so a deleted
// row came back and a freshly migrated row was overwritten with pre-migration bytes. The fix is a
// content-hash rev the client echoes. It is OPTIONAL by design — a caller that sends none is accepted
// exactly as before, so nothing that exists today breaks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const route = read("../app/api/tool-data/route.js");
const actions = read("../app/project/[accessId]/proposal-actions.js");
const sync = read("../app/project/[accessId]/tool-sync.js");

// the shipped rev function, replicated so the behaviour is pinned and not just the source text
const toolRev = (data) => (data == null ? "0" : createHash("sha256").update(String(data)).digest("hex").slice(0, 16));

test("the rev is a content hash, so it cannot drift from the row it describes", () => {
  assert.match(db, /export function toolRev\(data\) \{[\s\S]{0,200}createHash\("sha256"\)/);
  assert.equal(toolRev(null), "0", "no row has a rev of its own");
  assert.equal(toolRev('{"floors":[]}'), toolRev('{"floors":[]}'), "same bytes, same rev");
  assert.notEqual(toolRev('{"floors":[]}'), toolRev('{"floors":[1]}'), "different bytes, different rev");
  assert.equal(toolRev('{"a":1}').length, 16);
  // two writes inside one second get different revs, which updated_at (second resolution) cannot
  assert.notEqual(toolRev("v1"), toolRev("v2"));
});

test("getToolData hands the rev out, so a reader knows what it read", () => {
  assert.match(db, /return r \? \{ data: r\.data, updated_by: r\.updated_by, updated_at: r\.updated_at, rev: toolRev\(r\.data\) \} : null;/);
});

test("a write with no claim is accepted; a write with a stale claim is refused", () => {
  assert.match(db, /export function toolWriteIsStale\(accessId, tool, baseRev\)/);
  assert.match(db, /if \(typeof baseRev !== "string" \|\| !baseRev\) return false;/, "no claim -> nothing to check");
  assert.match(db, /return baseRev !== toolRev\(getToolData\(accessId, tool\)\?\.data \?\? null\);/);
  // replicate the decision table
  const isStale = (baseRev, current) => (typeof baseRev !== "string" || !baseRev) ? false : baseRev !== toolRev(current);
  assert.equal(isStale(undefined, "anything"), false, "a pre-B14 client still writes");
  assert.equal(isStale("", "anything"), false, "an empty claim is no claim");
  assert.equal(isStale(toolRev("current"), "current"), false, "up to date -> allowed");
  assert.equal(isStale(toolRev("old"), "current"), true, "behind -> refused");
  assert.equal(isStale("0", null), false, "read nothing, row still absent -> may create");
  assert.equal(isStale("0", "something"), true, "read nothing but a row appeared -> refused, not overwritten");
});

test("both write paths enforce it, and say so rather than silently winning", () => {
  for (const [src, who] of [[route, "POST /api/tool-data"], [actions, "saveToolDataAction"]]) {
    assert.match(src, /toolWriteIsStale\(accessId, tool, baseRev\)/, `${who} checks`);
    assert.match(src, /changed somewhere else since you opened it/, `${who} explains`);
    assert.match(src, /stale: true/, `${who} marks it so the client can re-seed`);
  }
  // Both paths also carry the editor id, for the one-editor-at-a-time lease.
  assert.match(route, /const \{ accessId, tool, data, allowEmpty, baseRev, editorId \} = await req\.json\(\);/);
  assert.match(actions, /\{ allowEmpty = false, baseRev = null, editorId = null \} = \{\}/);
});

test("the enforcement runs AFTER the role gate, so it cannot become an id or content oracle", () => {
  const gate = route.indexOf("Read-only for your role.");
  const exists = route.indexOf("!getJobByAccessId(accessId)");
  const stale = route.indexOf("toolWriteIsStale(accessId, tool, baseRev)");
  assert.ok(gate > 0 && exists > gate && stale > exists,
    "order must be: may you write -> does the project exist -> is your version current");
});

test("the client records the rev it read and claims it on the next write", () => {
  assert.match(sync, /const _baseRev = new Map\(\);/);
  assert.match(sync, /baseRev: _baseRev\.get\(`\$\{accessId\}:\$\{tool\}`\) \|\| undefined/, "sent with every push");
  assert.match(sync, /if \(out\?\.ok && out\.saved\?\.rev\) _setBaseRev\(accessId, tool, out\.saved\.rev\);/, "our own write becomes the new base");
  assert.equal((sync.match(/_setBaseRev\(accessId, tool, r\.saved\?\.rev \|\| "0"\)/g) || []).length, 2,
    "recorded on both server reads: the seed and the autosync priming fetch");
  // declared before the first use, so the module cannot be reordered into a TDZ error
  assert.ok(sync.indexOf("const _baseRev = new Map();") < sync.indexOf("baseRev: _baseRev.get("));
});

test("the POST returns the new rev, so a client is never stale against its own write", () => {
  assert.match(route, /saved: \{ updated_at: saved\.updated_at, rev: toolRev\(data\) \}/);
});
