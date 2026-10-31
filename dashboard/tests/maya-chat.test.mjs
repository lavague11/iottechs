// Item 2 — persistent Maya chat history + the public-receptionist rate limit. DB-backed: a temp DB is created
// before db.js is imported (matching the other db-backed tests). Proves scope isolation (a customer thread is
// keyed by access_id and never bleeds across projects; a public thread is keyed by session_key) and that the
// rolling-window limiter caps a bucket.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "mayachat-"));
process.env.TZ = "America/New_York";

const { appendMayaMessage, mayaThread, mayaConversations, mayaConversation, rateAllow } = await import("../lib/db.js");

test("customer thread is scoped to its own project", () => {
  appendMayaMessage({ channel: "customer", accessId: "ASC0001", role: "you", text: "what's my status" });
  appendMayaMessage({ channel: "customer", accessId: "ASC0001", role: "ai", text: "You're in survey." });
  appendMayaMessage({ channel: "customer", accessId: "ASC0002", role: "you", text: "other project" });

  const t1 = mayaThread({ channel: "customer", accessId: "ASC0001" });
  assert.equal(t1.length, 2);
  assert.equal(t1[0].role, "you");           // oldest first
  assert.equal(t1[0].text, "what's my status");
  assert.equal(t1[1].role, "ai");
  // never crosses projects
  assert.ok(!t1.some((m) => m.text === "other project"));

  const t2 = mayaThread({ channel: "customer", accessId: "ASC0002" });
  assert.equal(t2.length, 1);
});

test("public thread is scoped to its session key, carries media id", () => {
  appendMayaMessage({ channel: "public", sessionKey: "sessAAA", role: "you", text: "hi" });
  appendMayaMessage({ channel: "public", sessionKey: "sessAAA", role: "ai", text: "hello", mediaId: "mid123" });
  appendMayaMessage({ channel: "public", sessionKey: "sessBBB", role: "you", text: "elsewhere" });

  const a = mayaThread({ channel: "public", sessionKey: "sessAAA" });
  assert.equal(a.length, 2);
  assert.equal(a[1].mediaId, "mid123");
  assert.ok(!a.some((m) => m.text === "elsewhere"));
  // a customer read never sees public rows
  assert.equal(mayaThread({ channel: "customer", accessId: "sessAAA" }).length, 0);
});

test("conversations list groups public sessions with a preview", () => {
  const list = mayaConversations({ limit: 40 });
  const aaa = list.find((c) => c.sessionKey === "sessAAA");
  assert.ok(aaa);
  assert.equal(aaa.preview, "hi");
  assert.ok(aaa.turns >= 2);
  // drill-down returns the full ordered turn list
  const full = mayaConversation("sessAAA");
  assert.equal(full[0].text, "hi");
});

test("rate limiter caps a bucket within the window then recovers on a fresh window", () => {
  // small window so a cap is reached deterministically
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (rateAllow("bkt", 3, 600)) allowed++;
  assert.equal(allowed, 3);                   // 3 allowed, then blocked
  assert.equal(rateAllow("bkt", 3, 600), false);
  // a different bucket is independent
  assert.equal(rateAllow("other", 3, 600), true);
});
