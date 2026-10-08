// PIN-scoped iot_access grant: expiry, tampering, project scoping, and the sliding re-mint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { makeAccessToken, parseAccessToken, refreshAccessToken, makeToken, parseToken, accessTtlFor, ACCESS_MAX_MS } from "../lib/auth.js";

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;
const b64 = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
const unb64 = (t) => atob(t.replace(/-/g, "+").replace(/_/g, "/"));

test("customer grant is valid inside its window and rejected after", async () => {
  const ttl = accessTtlFor("customer");
  assert.ok(ttl >= 30 * MIN, "customer window is no longer the old 5 minutes");
  const tok = await makeAccessToken("ASC0041", "customer", null, T0);
  assert.deepEqual((await parseAccessToken(tok, T0 + ttl - 1)).accessId, "ASC0041");
  assert.equal(await parseAccessToken(tok, T0 + ttl + 1), null);
});

test("tampered signature, role or project is rejected", async () => {
  const tok = await makeAccessToken("ASC0041", "customer", null, T0);
  const raw = unb64(tok);
  const parts = raw.split(":");
  const badSig = b64([...parts.slice(0, -1), "0000000000000000"].join(":"));
  assert.equal(await parseAccessToken(badSig, T0), null);
  const asAdmin = b64([parts[0], "admin", ...parts.slice(2)].join(":"));
  assert.equal(await parseAccessToken(asAdmin, T0), null, "role cannot be widened");
  const otherProject = b64(["ASC9999", ...parts.slice(1)].join(":"));
  assert.equal(await parseAccessToken(otherProject, T0), null, "accessId cannot be swapped");
  const extendedSince = b64([parts[0], parts[1], parts[2], String(T0 + 99 * MIN), parts[4]].join(":"));
  assert.equal(await parseAccessToken(extendedSince, T0), null, "since cannot be edited");
  assert.equal(await parseAccessToken("garbage", T0), null);
});

test("legacy 4-part tokens (pre-sliding) still parse, expiring on their own issuedAt", async () => {
  const secret = process.env.SESSION_SECRET || "iot_techs_session_secret_2026";
  const payload = `ASC0041:customer:${T0}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  const legacy = b64(`${payload}:${sig}`);
  const g = await parseAccessToken(legacy, T0 + MIN);
  assert.equal(g.accessId, "ASC0041");
  assert.equal(g.since, T0);
  assert.equal(await parseAccessToken(legacy, T0 + accessTtlFor("customer") + 1), null);
});

test("refresh slides the window, keeps project + role, and keeps the original ceiling", async () => {
  const ttl = accessTtlFor("customer");
  const tok = await makeAccessToken("ASC0041", "customer", null, T0);
  assert.equal(await refreshAccessToken(tok, T0 + 10 * 1000), null, "no re-mint within a minute of issuing");
  const t1 = T0 + 20 * MIN;
  const next = await refreshAccessToken(tok, t1);
  assert.ok(next && next !== tok);
  const g = await parseAccessToken(next, t1 + ttl - 1);
  assert.equal(g.accessId, "ASC0041");
  assert.equal(g.role, "customer");
  assert.equal(g.since, T0, "since is preserved across re-mints");
  assert.ok(await parseAccessToken(next, T0 + ttl + 5 * MIN), "alive past the ORIGINAL token's expiry");
});

test("refresh refuses an expired grant and one past the absolute ceiling", async () => {
  const ttl = accessTtlFor("customer");
  const tok = await makeAccessToken("ASC0041", "customer", null, T0);
  assert.equal(await refreshAccessToken(tok, T0 + ttl + 1), null, "expired grant cannot be revived");
  // Keep sliding every 20 min until just before the ceiling, then confirm the ceiling holds.
  let cur = tok, now = T0;
  const cap = ACCESS_MAX_MS.customer;
  while (now + 20 * MIN < T0 + cap) { now += 20 * MIN; cur = await refreshAccessToken(cur, now); assert.ok(cur); }
  assert.equal(await parseAccessToken(cur, T0 + cap + MIN), null, "past 8h since first mint → re-gate");
  assert.equal(await refreshAccessToken(cur, T0 + cap + MIN), null);
});

test("non-customer roles do not slide", async () => {
  const tok = await makeAccessToken("ASC0041", "tech", null, T0);
  assert.equal(await refreshAccessToken(tok, T0 + 5 * MIN), null);
});

test("makeToken: a phone-only account (null email) never serializes the string 'null'", async () => {
  for (const email of [null, undefined]) {
    const t = await makeToken({ id: 7, role: "customer", email });
    assert.ok(!unb64(t).includes("null") && !unb64(t).includes("undefined"));
    const u = await parseToken(t);
    assert.equal(u.id, 7);
    assert.equal(u.email, "");
  }
  const withEmail = await parseToken(await makeToken({ id: 8, role: "customer", email: "a@b.co" }));
  assert.equal(withEmail.email, "a@b.co");
});

test("parseToken reads a legacy token carrying the literal 'null' email as no email", async () => {
  // Reproduce the old makeToken output (payload id:role:null) with the real signer path via makeToken's twin:
  const good = await makeToken({ id: 9, role: "customer", email: "null" });
  const u = await parseToken(good);
  assert.equal(u.email, "");
});
