// Auth token utilities — safe to import from both middleware (edge) and server actions.
// Uses only Web Crypto API so it works on the edge runtime.

// In production set SESSION_SECRET (and optionally PREVIEW_SECRET) to long random strings via the
// host's env vars — never commit them. The literals below are dev-only fallbacks. Changing the
// production secret invalidates existing login tokens (fine at launch; nobody's signed in yet).
const SECRET = process.env.SESSION_SECRET || "iot_techs_session_secret_2026";
const PREVIEW_SECRET = process.env.PREVIEW_SECRET || "iot_preview_2026";

async function hmac(payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,"0")).join("").slice(0, 16);
}

export async function makeToken(user) {
  const payload = `${user.id}:${user.role}:${user.email}`;
  const sig = await hmac(payload);
  return btoa(`${payload}:${sig}`).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}

export async function parseToken(token) {
  try {
    const raw = atob(token.replace(/-/g,"+").replace(/_/g,"/"));
    const parts = raw.split(":");
    if (parts.length < 4) return null;
    const [id, role, email, sig] = parts;
    const payload = `${id}:${role}:${email}`;
    const expected = await hmac(payload);
    if (sig !== expected) return null;
    return { id: Number(id), role, email };
  } catch {
    return null;
  }
}

// PIN-scoped access token — a customer/tech who unlocks a project with its PIN gets no login
// session, so this signed cookie (accessId:role:issuedAt) authorizes their writes on THAT
// project only, for a limited window. Different roles get different leashes: a customer's
// grant is short (they may be on a shared/borrowed device), staff get more room to work.
// ACCESS_TTL_MS is exported so callers can size the cookie's own maxAge to match.
export const ACCESS_TTL_MS = {
  customer: 5 * 60 * 1000,          // 5 min — re-checked on every request, so a refresh past this re-gates
  tech:     4 * 60 * 60 * 1000,     // 4 hours — a technician is on-site working a job, not idly browsing
  admin:    60 * 60 * 1000,         // 1 hour
  manager:  60 * 60 * 1000,
  sales:    60 * 60 * 1000,
};
const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000;
export function accessTtlFor(role) { return ACCESS_TTL_MS[role] || DEFAULT_ACCESS_TTL_MS; }

export async function makeAccessToken(accessId, role) {
  const payload = `${accessId}:${role}:${Date.now()}`;
  const sig = await hmac(payload);
  return btoa(`${payload}:${sig}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
export async function parseAccessToken(token) {
  try {
    const raw = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const parts = raw.split(":");
    if (parts.length < 4) return null;
    const [accessId, role, issuedAt, sig] = parts;
    if ((await hmac(`${accessId}:${role}:${issuedAt}`)) !== sig) return null;
    if (Date.now() - Number(issuedAt) > accessTtlFor(role)) return null;   // expired — re-gate
    return { accessId, role };
  } catch {
    return null;
  }
}

async function previewHmac(payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(PREVIEW_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,"0")).join("").slice(0, 16);
}

// 5-minute window token — sign(accessId:role:window)
export async function makePreviewToken(accessId, role) {
  const window = Math.floor(Date.now() / 300000);
  const payload = `${accessId}:${role}:${window}`;
  const sig = await previewHmac(payload);
  return `${sig}`;
}

export async function verifyPreviewToken(accessId, role, token) {
  if (!token) return false;
  const now = Math.floor(Date.now() / 300000);
  // Accept current window and the previous one (handles boundary edge)
  for (const w of [now, now - 1]) {
    const payload = `${accessId}:${role}:${w}`;
    const expected = await previewHmac(payload);
    if (token === expected) return true;
  }
  return false;
}
