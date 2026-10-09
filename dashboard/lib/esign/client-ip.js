// The client IP recorded on sign_events and printed on the certificate of completion.
//
// TRUST ASSUMPTION (single trusted proxy): production sits behind exactly ONE front proxy (Hostinger /
// LiteSpeed) that APPENDS the address it saw to X-Forwarded-For. Everything to the left of that last entry
// is whatever the client sent, so the LEFTMOST hop is forgeable and is never used here. We take the
// RIGHTMOST entry (the one our proxy added). If the app is ever put behind a second proxy/CDN, this must
// be revisited (take the Nth-from-right hop instead). With no XFF at all (direct/local) we fall back to
// X-Real-IP, then null — a missing IP is recorded as missing, never invented.
import { isIP } from "node:net";

function clean(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s);          // [::1]:443
  if (br) s = br[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));   // 1.2.3.4:5678
  return isIP(s) ? s : null;
}

// `get` = (name) => header value | null (a Headers instance's .get, or a test stub).
export function trustedClientIp(get) {
  const xff = String(get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = xff.length - 1; i >= 0; i--) { const ip = clean(xff[i]); if (ip) return ip; }   // rightmost valid hop
  return clean(get("x-real-ip"));
}
