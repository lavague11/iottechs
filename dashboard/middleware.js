import { NextResponse } from "next/server";
import { parseToken } from "./lib/auth";

const PROTECTED = ["/dashboard", "/sales", "/tech", "/customers", "/portal", "/manager", "/my-projects", "/users", "/activity", "/inventory", "/tickets", "/projects", "/notifications", "/finances", "/expenses", "/support", "/tech-support", "/service-calls", "/onboarding"];

export async function middleware(request) {
  // Canonical host: send www.iot-techs.com → the bare apex, same path + query. Only fires for a
  // "www." host, so there's no redirect loop (the apex host doesn't match). A plain 301 the browser
  // caches — unrelated to the server-action redirects the CDN was dropping.
  const host = (request.headers.get("host") || "").toLowerCase();
  if (host.startsWith("www.")) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = host.slice(4);   // strip "www."
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  const { pathname } = request.nextUrl;

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get("iot_session")?.value;
  const user  = token ? await parseToken(token) : null;

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Runs on every page/route (so the www→apex canonical redirect applies everywhere) except Next's
// internal static assets. Auth is still only enforced on PROTECTED paths inside middleware().
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
