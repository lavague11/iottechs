// Signing-IP derivation: only the trusted proxy's hop counts; client-supplied XFF entries never win.
import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedClientIp } from "../lib/esign/client-ip.js";

const h = (o) => (n) => o[n] ?? null;

test("takes the RIGHTMOST x-forwarded-for hop (the one our proxy appended), not the forgeable leftmost", () => {
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9");
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" })), "203.0.113.9");
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
});
test("a forged spoof header can't displace the proxy hop", () => {
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "10.0.0.1, 198.51.100.7", "x-real-ip": "10.0.0.1" })), "198.51.100.7");
});
test("skips garbage entries, strips ports, handles IPv6", () => {
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "9.9.9.9, not-an-ip" })), "9.9.9.9");
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.9:51234" })), "203.0.113.9");
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "[2001:db8::1]:443" })), "2001:db8::1");
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "2001:db8::2" })), "2001:db8::2");
});
test("falls back to x-real-ip, then to null — never invents an address", () => {
  assert.equal(trustedClientIp(h({ "x-real-ip": "203.0.113.5" })), "203.0.113.5");
  assert.equal(trustedClientIp(h({ "x-real-ip": "junk" })), null);
  assert.equal(trustedClientIp(h({})), null);
  assert.equal(trustedClientIp(h({ "x-forwarded-for": "" })), null);
});
