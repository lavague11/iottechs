// Role / disabled changes invalidate a user's existing login sessions (session_epoch), so an upgraded
// account re-authenticates and every surface sees the new role — instead of staying stuck on the old
// dashboard until the 90-day token expires. Token round-trip is functional; the wiring is source-level.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeToken, parseToken } from "../lib/auth.js";

const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
const session = readFileSync(new URL("../lib/session.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/project/[accessId]/page.jsx", import.meta.url), "utf8");

test("the login token carries the session_epoch and round-trips", async () => {
  const tok = await makeToken({ id: 7, role: "manager", email: "m@x.com", session_epoch: 3 });
  const p = await parseToken(tok);
  assert.equal(p.id, 7); assert.equal(p.role, "manager"); assert.equal(p.epoch, 3);
});

test("a tampered token is rejected, and a legacy pre-epoch token parses as epoch 0", async () => {
  const tok = await makeToken({ id: 1, role: "admin", email: "a@x.com", session_epoch: 0 });
  assert.equal(await parseToken(tok + "x"), null, "tampered → null");
  // Craft a legacy 4-part token the old makeToken would have produced (id:role:email:sig, no epoch).
  const raw = Buffer.from(tok.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  const [id, role, email] = raw.split(":");
  const { createHmac } = await import("node:crypto");
  const SECRET = process.env.SESSION_SECRET || "iot_techs_session_secret_2026";
  const sig = createHmac("sha256", SECRET).update(`${id}:${role}:${email}`).digest("hex").slice(0, 16);
  const legacy = Buffer.from(`${id}:${role}:${email}:${sig}`).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const p = await parseToken(legacy);
  assert.ok(p && p.id === 1 && p.epoch === 0, "legacy 4-part token still valid, epoch 0 (no mass logout)");
});

test("a role or disabled change bumps session_epoch", () => {
  assert.ok(/setUserRole[\s\S]*session_epoch = COALESCE\(session_epoch, 0\) \+ 1/.test(db), "setUserRole bumps the epoch");
  assert.ok(/setUserDisabled[\s\S]*session_epoch = COALESCE\(session_epoch, 0\) \+ 1/.test(db), "setUserDisabled bumps the epoch");
  assert.ok(db.includes("ADD COLUMN session_epoch INTEGER DEFAULT 0"), "the column exists");
});

test("every getter that mints a token selects session_epoch", () => {
  // getUserById is the one getSessionUser + the project loader read the epoch from — it MUST include it.
  assert.ok(/getUserById[\s\S]{0,160}session_epoch FROM users/.test(db), "getUserById selects session_epoch");
  for (const marker of [
    "role, disabled, session_epoch FROM users WHERE LOWER(email) = ?",      // getUserByEmail
    "phone, role, session_epoch FROM users WHERE REPLACE",                   // getUserByPhone
    "tech_cert, session_epoch FROM users WHERE (disabled IS NULL",           // getStaffUsers
  ]) assert.ok(db.includes(marker), `token-minting getter selects session_epoch (${marker.slice(0, 24)}…)`);
});

test("the session reader + project loader reject a stale-epoch token (forced re-login)", () => {
  assert.ok(session.includes("Number(u.session_epoch || 0) !== Number(s.epoch || 0)") && session.includes('role: "guest"'), "getSessionUser signs out a stale session");
  assert.ok(page.includes("Number(su.session_epoch || 0) !== Number(user.epoch || 0)") && page.includes("user = null"), "resolveSessionView drops a stale session");
});
