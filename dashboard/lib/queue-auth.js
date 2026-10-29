import { secretValue } from "./db";

// Constant-time compare — avoids leaking the match position/length through timing.
function safeEqual(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}

// The bug-queue RUNNER authenticates with a Bearer token = app_secrets.BUG_QUEUE_TOKEN (set in the vault,
// never in browser JS). Returns true only when a non-empty token is configured AND the header matches it.
// When no token is configured the runner API stays closed (fail-safe).
export function runnerAuthorized(req) {
  const token = secretValue("BUG_QUEUE_TOKEN");
  if (!token || !token.trim()) return false;
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") || "").trim());
  return !!m && safeEqual(m[1].trim(), token.trim());
}
