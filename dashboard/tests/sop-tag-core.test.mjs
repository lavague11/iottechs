// Behavioural tests for the pure auto-tag core (stubbed fetch, recording write, no DB).
import test from "node:test";
import assert from "node:assert/strict";
import { runAutoTag } from "../lib/sop-tag-core.js";
import { cleanTags, SOP_TAG_SYSTEM } from "../lib/sop-model.js";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: 9000 + i, title: `Step title ${i}`, instruction: `instruction ${i}`, guide: "Guide Alpha" }));
const ok = (map) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ tags: map }) }] }) });
const okText = (text) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }) });
const err = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });
function harness(responses) {
  const bodies = [];
  let i = 0;
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return responses[Math.min(i++, responses.length - 1)]; };
  const writes = [];
  const write = (id, tags) => { writes.push([id, tags]); return tags; };
  return { bodies, writes, fetchImpl, write, sleep: async () => {} };
}
const run = (h, r) => runAutoTag({ rows: r, key: "k", model: "m", fetchImpl: h.fetchImpl, write: h.write, sleep: h.sleep });
const sentIds = (body) => Object.keys(JSON.parse(/"""(.*)"""/s.exec(body.messages[0].content)[1]).reduce((a, s) => ({ ...a, [s.id]: 1 }), {}));

test("full map: every row written under its REAL id, request carries numeric ids only", async () => {
  const r = rows(3);
  const h = harness([ok({ 1: ["camera"], 2: ["nvr"], 3: ["cable"] })]);
  const out = await run(h, r);
  assert.equal(out.tagged, 3);
  assert.deepEqual(h.writes.map((w) => w[0]), [9000, 9001, 9002]);
  assert.deepEqual(out.written, { 9000: ["camera"], 9001: ["nvr"], 9002: ["cable"] });
  assert.equal(h.bodies.length, 1);
  const b = h.bodies[0];
  assert.equal(b.system, SOP_TAG_SYSTEM);
  assert.equal(b.max_tokens, 4096);
  assert.deepEqual(sentIds(b), ["1", "2", "3"]);
  assert.ok(!JSON.stringify(b).includes("9000"), "no real step id leaves the server");
});

test("partial map: second request has only the skipped rows and they are written from attempt 2", async () => {
  const r = rows(3);
  const h = harness([ok({ 1: ["a1"], 3: ["c1"] }), ok({ 1: ["b2"] })]);
  const out = await run(h, r);
  assert.equal(h.bodies.length, 2);
  assert.deepEqual(sentIds(h.bodies[1]), ["1"]);
  assert.ok(JSON.stringify(h.bodies[1]).includes("Step title 1") && !JSON.stringify(h.bodies[1]).includes("Step title 0"));
  assert.deepEqual(out.written, { 9000: ["a1"], 9001: ["b2"], 9002: ["c1"] });
});

test("still skipped: fallbackTags, then guide-title fallback, then left alone", async () => {
  const r = [
    { id: 1, title: "Camera reset", instruction: "", guide: "G" },
    { id: 2, title: "!!", instruction: "", guide: "Network Guide" },
    { id: 3, title: "!!", instruction: "", guide: "!!" },
    { id: 4, title: "ok", instruction: "", guide: "G" },
  ];
  const h = harness([ok({ 4: ["real"] }), ok({})]);
  const out = await run(h, r);
  assert.deepEqual(out.written[1], ["camera", "reset"]);
  assert.deepEqual(out.written[2], ["network", "guide"]);
  assert.equal(out.written[3], undefined);
  assert.deepEqual(out.written[4], ["real"]);
  assert.equal(out.tagged, 3);
});

test("attempt 2 failure is best-effort: attempt 1 results kept", async () => {
  const h = harness([ok({ 1: ["a"] }), err(401, "bad key")]);
  const out = await run(h, rows(2));
  assert.deepEqual(out.written[9000], ["a"]);
  assert.ok(out.written[9001], "skipped row got fallback tags");
});

test("zero parsed: rejects 502, write never called", async () => {
  for (const resp of [okText("not json at all"), ok({}), ok({ 77: ["x"] })]) {
    const h = harness([resp]);
    await assert.rejects(() => run(h, rows(2)), (e) => e.status === 502 && /unreadable/.test(e.message));
    assert.equal(h.writes.length, 0);
  }
});

test("invented ids are ignored", async () => {
  const h = harness([ok({ 1: ["a"], 99: ["ghost"] }), ok({})]);
  const out = await run(h, rows(1));
  assert.deepEqual(Object.keys(out.written), ["9000"]);
  assert.ok(!h.writes.some((w) => w[1].includes("ghost")));
});

test("401 -> 502 invalid key; credit error -> 402", async () => {
  await assert.rejects(() => run(harness([err(401, "x")]), rows(1)), (e) => e.status === 502 && /invalid/.test(e.message));
  await assert.rejects(() => run(harness([err(400, "Your credit balance is too low")]), rows(1)), (e) => e.status === 402);
});

test("529 then 200 is retried and succeeds", async () => {
  const h = harness([err(529, "overloaded"), ok({ 1: ["a"] })]);
  const out = await run(h, rows(1));
  assert.equal(out.tagged, 1);
  assert.equal(h.bodies.length, 2);
});

test("cleanTags caps each tag at 30 chars", () => {
  const t = cleanTags(["x".repeat(80), "ok"]);
  assert.equal(t[0].length, 30);
  assert.deepEqual(t[1], "ok");
});
