// ONE EDITOR AT A TIME, and the overwrite hole it closes.
//
// THE LOSS THIS EXISTS FOR. ASC0055 held six named cameras on Floor 1 — Grand 1-3, Communipaw 1-3.
// A single write on 2026-11-23 at 05:47 replaced the row with a copy that had none of them, and the
// cameras were gone. Every guard in place at the time let it through:
//   · emptyOverContent  — the blob was NOT empty (Floor 2 still had ten devices), so it passed.
//   · toolWriteIsStale  — returns false when no baseRev is sent: "no claim made -> nothing to check".
//     A tab that never successfully read the row sends none, so it overwrote freely.
// The fix is two refusals, both server-side, because a guard in the browser does not stop the stale
// browser: a write to a survey that already holds work must carry a claim, and while somebody holds
// the editing lease nobody else writes at all.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLAIM_TTL_MS, CLAIM_HEARTBEAT_MS, CLAIMED_TOOLS, isClaimedTool,
  claimStatus, claimAllowsWrite, claimIsAvailable, claimBanner, newEditorId,
} from "../lib/tool-claim.js";

const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
const sync = readFileSync(new URL("../app/project/[accessId]/tool-sync.js", import.meta.url), "utf8");
const claimRoute = readFileSync(new URL("../app/api/tool-claim/route.js", import.meta.url), "utf8");
const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

const T0 = Date.parse("2026-11-23T10:00:00");
// SQLite writes datetime('now','localtime') — a LOCAL time string with no zone — and claimStatus
// parses it the same way. Building the fixture in UTC would shift every assertion by the offset.
const pad = (n) => String(n).padStart(2, "0");
const at = (offsetMs) => { const d = new Date(T0 + offsetMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const row = (editor, renewedOffsetMs, name = null) =>
  ({ editor_id: editor, editor_name: name, acquired_at: at(0), renewed_at: at(renewedOffsetMs) });

// ---------------------------------------------------------------- the lease

test("a live lease belongs to its holder and blocks everyone else", () => {
  const r = row("ed_a", 0, "Ari");
  const now = T0 + 10_000;
  assert.equal(claimStatus(r, "ed_a", now).state, "mine");
  assert.equal(claimStatus(r, "ed_b", now).state, "held");
  assert.equal(claimStatus(r, "ed_b", now).holderName, "Ari");
  assert.equal(claimAllowsWrite(r, "ed_a", now), true, "the holder writes");
  assert.equal(claimAllowsWrite(r, "ed_b", now), false, "nobody else does");
  // A client that sends no editor id is not the holder, so it cannot write a claimed survey either.
  assert.equal(claimAllowsWrite(r, null, now), false, "an unidentified writer is not the holder");
  assert.equal(claimAllowsWrite(r, undefined, now), false);
});

test("a lease lapses when the heartbeat stops, and survives a missed beat", () => {
  const r = row("ed_a", 0);
  // One missed beat must never hand the survey away mid-edit.
  assert.equal(claimStatus(r, "ed_b", T0 + CLAIM_HEARTBEAT_MS + 1_000).state, "held");
  assert.ok(CLAIM_TTL_MS >= CLAIM_HEARTBEAT_MS * 3, "the lease outlives several beats");
  // A closed laptop frees it.
  assert.equal(claimStatus(r, "ed_b", T0 + CLAIM_TTL_MS + 1).state, "free");
  assert.equal(claimAllowsWrite(r, "ed_b", T0 + CLAIM_TTL_MS + 1), true);
});

test("no row, no holder and a junk timestamp all read as free", () => {
  for (const r of [null, undefined, {}, { editor_id: "ed_a" }, { editor_id: "ed_a", renewed_at: "not a date" }]) {
    assert.equal(claimStatus(r, "ed_b").state, "free", JSON.stringify(r));
    assert.equal(claimAllowsWrite(r, "ed_b"), true);
    assert.equal(claimIsAvailable(r, "ed_b"), true);
  }
});

test("the banner names the holder, and says nothing when the survey is free", () => {
  assert.equal(claimBanner(claimStatus(row("ed_a", 0, "Ari"), "ed_b", T0 + 1_000)), "Ari is editing this survey");
  assert.equal(claimBanner(claimStatus(row("ed_a", 0), "ed_b", T0 + 1_000)), "Someone else is editing this survey");
  assert.equal(claimBanner(claimStatus(row("ed_a", 0, "Ari"), "ed_a", T0 + 1_000)), null, "not to the holder");
  assert.equal(claimBanner(claimStatus(null, "ed_b")), null, "not when it is free");
});

test("two tabs are two editors", () => {
  const a = newEditorId(), b = newEditorId();
  assert.notEqual(a, b, "ids are distinct");
  assert.match(a, /^ed_/);
  // …and the client stores it per TAB, which is what makes two tabs of one person two editors.
  assert.match(sync, /sessionStorage\.getItem\("iot_editor_id"\)/, "editor id lives in sessionStorage");
  assert.ok(!/localStorage\.getItem\("iot_editor_id"\)/.test(sync), "never localStorage — that is shared between tabs");
});

test("only the survey tools take a lease", () => {
  assert.deepEqual([...CLAIMED_TOOLS].sort(), ["survey", "survey2"]);
  for (const t of ["survey", "survey2"]) assert.ok(isClaimedTool(t));
  for (const t of ["mockup", "schedule", "install", "qc", "walkthrough", "", null]) assert.ok(!isClaimedTool(t));
});

// ---------------------------------------------------------------- the hole, closed

test("THE HOLE: a write with no claim is refused on BOTH paths", () => {
  // toolWriteNeedsClaim is the whole fix in one function; it is deliberately narrow.
  const fn = db.slice(db.indexOf("export function toolWriteNeedsClaim"));
  assert.match(fn, /if \(!isClaimedTool\(tool\)\) return false;/, "only the survey tools");
  assert.match(fn, /if \(typeof baseRev === "string" && baseRev\) return false;/, "a claim was made -> fine");
  assert.match(fn, /toolHasData\(tool, existing\.data\)/, "only when there is work to lose");
  // Both writers must enforce it, or it is not enforced.
  for (const [src, who] of [[route, "POST /api/tool-data"], [actions, "saveToolDataAction"]]) {
    assert.match(src, /toolWriteNeedsClaim\(accessId, tool, baseRev\)/, `${who} requires a claim`);
    assert.match(src, /never loaded from the server/, `${who} says why`);
  }
});

test("while somebody holds the lease, BOTH write paths refuse", () => {
  for (const [src, who] of [[route, "POST /api/tool-data"], [actions, "saveToolDataAction"]]) {
    assert.match(src, /isClaimedTool\(tool\)/, `${who} checks the tool`);
    assert.match(src, /claimStatus\(/, `${who} reads the lease`);
    assert.match(src, /state === "held"/, `${who} refuses a held row`);
    assert.match(src, /is editing this survey/, `${who} names the holder`);
  }
});

test("the refusals run AFTER the role gate, so they are not an id oracle", () => {
  const gate = route.indexOf("Read-only for your role.");
  const exists = route.indexOf("!getJobByAccessId(accessId)");
  const needs = route.indexOf("toolWriteNeedsClaim(accessId, tool, baseRev)");
  const held = route.indexOf('state === "held"');
  assert.ok(gate > 0 && exists > gate && needs > exists && held > needs,
    "role gate -> project exists -> claim required -> lease honoured");
});

test("a takeover is a person's decision, never a loop's", () => {
  // The heartbeat asks for "claim", which is refused while somebody else holds it. Only the button
  // sends "takeover".
  assert.match(sync, /claimCall\(accessId, tool, "claim"\)/, "the heartbeat claims");
  assert.match(sync, /export async function takeOverTool\(accessId, tool\) \{ return claimCall\(accessId, tool, "takeover"\); \}/,
    "takeover is its own exported call");
  assert.ok(!/setInterval\([^)]*takeover/.test(sync), "nothing takes over on a timer");
  assert.match(claimRoute, /const takeover = action === "takeover";/, "the server distinguishes the two");
  // Claiming without takeover cannot steal a live lease.
  const fn = db.slice(db.indexOf("export function claimToolEditor"));
  assert.match(fn, /if \(st\.state === "held" && !takeover\) return \{ ok: false/, "a plain claim is refused");
});

test("only the holder releases the lease", () => {
  const fn = db.slice(db.indexOf("export function releaseToolClaim"), db.indexOf("export function releaseToolClaim") + 400);
  assert.match(fn, /AND editor_id=\?/, "a release names the holder, so a closing tab cannot free somebody else's lease");
});

test("a tab that is blocked stops pushing instead of retrying a refusal every 5 seconds", () => {
  assert.match(sync, /if \(claimed && \(_claims\.get\(mapKey\) \|\| \{\}\)\.state === "held"\) return;/,
    "the autosync stands down while somebody else is editing");
  assert.match(sync, /claimCall\(accessId, tool, "release"\)/, "and gives the lease back when it stops");
});

test("the lease is gated on who may edit the survey at all", () => {
  assert.match(claimRoute, /can\(tok\.role, "survey\.edit"\)/, "the same capability that lets someone write it");
  assert.match(claimRoute, /viaPin && String\(tok\.accessId\) !== String\(accessId\)/, "a PIN grant is scoped to its own project");
});
