import { cookies } from "next/headers";
import { secretValue } from "../../../../lib/db";
import { publicBase } from "../../../../lib/auth";

// Start the Google OAuth flow. Dormant until GOOGLE_OAUTH_CLIENT_ID is set in the vault. `ctx` carries
// where the user came from (login | apply) so the callback can create the right kind of account.
export async function GET(request) {
  const url = new URL(request.url);
  const base = publicBase(request, url);
  const ctx = url.searchParams.get("ctx") === "apply" ? "apply" : "login";
  // Optional return-to path (e.g. the project page the login gate is on). Same-site only: must be a
  // relative path starting with a single "/", never a scheme or protocol-relative URL.
  const nextRaw = url.searchParams.get("next") || "";
  const next = /^\/[^/]/.test(nextRaw) ? nextRaw.slice(0, 300) : "";
  const clientId = secretValue("GOOGLE_OAUTH_CLIENT_ID");
  if (!clientId) return Response.redirect(`${base}/login?err=google_off`, 302);

  // CSRF: a random nonce (+ ctx + return path) stashed in a short-lived cookie, echoed back as `state`.
  const nonce = crypto.randomUUID();
  const jar = await cookies();
  jar.set("g_oauth", JSON.stringify({ n: nonce, c: ctx, x: next }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", `${base}/api/auth/google/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", nonce);
  auth.searchParams.set("access_type", "online");
  auth.searchParams.set("prompt", "select_account");
  return Response.redirect(auth.toString(), 302);
}
