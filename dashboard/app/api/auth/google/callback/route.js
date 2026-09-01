import { cookies } from "next/headers";
import { secretValue, getUserByEmail, createCustomerUser, findApplicationByEmail } from "../../../../../lib/db";
import { makeToken, makeSvcToken, SVC_ACCESS_TTL_MS, publicBase } from "../../../../../lib/auth";

const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };

// Google OAuth callback. Verifies CSRF state + the token, then:
//   • known email  → sign in (mint iot_session), go to the role's home
//   • unknown from /login → create a role='customer' account + sign in
//   • unknown from /apply → send them into the application, prefilled, to finish it (a real applicant)
export async function GET(request) {
  const url = new URL(request.url);
  const base = publicBase(request, url);
  const jar = await cookies();
  const fail = (code) => Response.redirect(`${base}/login?err=${code}`, 302);

  const stored = jar.get("g_oauth")?.value || "";
  try { jar.delete("g_oauth"); } catch {}

  try {
    if (url.searchParams.get("error")) return fail("google_denied");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    let parsed = {}; try { parsed = JSON.parse(stored || "{}"); } catch {}
    const nonce = parsed.n;
    const ctx = parsed.c === "apply" ? "apply" : "login";
    const next = (typeof parsed.x === "string" && /^\/[^/]/.test(parsed.x)) ? parsed.x : "";
    if (!code || !state || !nonce || nonce !== state) return fail("google_state");

    const clientId = secretValue("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = secretValue("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) return fail("google_off");

    // Exchange the code for tokens.
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${base}/api/auth/google/callback`, grant_type: "authorization_code" }),
    });
    if (!tokRes.ok) return fail("google");
    const tok = await tokRes.json();

    // Pull the verified profile.
    const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!uiRes.ok) return fail("google");
    const profile = await uiRes.json();
    const email = String(profile.email || "").trim().toLowerCase();
    if (!email || profile.email_verified === false) return fail("google_email");
    const name = (profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || "").trim();

    // From /apply (or the Track page): if this email ALREADY has an application, don't let them
    // reapply — grant the applicant cookie and open their existing application. Otherwise Google is
    // just a fast prefill and the real application still goes through /api/apply (staff-block /
    // customer-flag / dup checks) with the name + email filled in.
    if (ctx === "apply") {
      const existing = findApplicationByEmail(email);
      if (existing) {
        jar.set("iot_app", await makeSvcToken(existing.app_id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.floor(SVC_ACCESS_TTL_MS / 1000), secure: process.env.NODE_ENV === "production" });
        return Response.redirect(`${base}/application/${existing.app_id}`, 302);
      }
      const p = new URLSearchParams({ g_email: email, ...(name ? { g_name: name } : {}) });
      return Response.redirect(`${base}/apply?${p.toString()}`, 302);
    }

    // From /login: known email signs in; an unknown email gets a customer account, then signs in.
    let user = getUserByEmail(email);
    if (user && Number(user.disabled) === 1) return fail("disabled");
    if (!user) {
      createCustomerUser(name || "Customer", email, null);
      user = getUserByEmail(email);
      if (!user) return fail("google");
    }

    const token = await makeToken({ id: user.id, role: user.role, email: user.email });
    jar.set("iot_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8, secure: process.env.NODE_ENV === "production" });
    // Return to where they started (e.g. the project page) when given a safe same-site path; else home.
    const dest = next || ROLE_HOME[user.role] || "/dashboard";
    return Response.redirect(`${base}${dest}`, 302);
  } catch {
    return fail("google");
  }
}
