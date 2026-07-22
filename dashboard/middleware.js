import { NextResponse } from "next/server";
import { parseToken } from "./lib/auth";

const PROTECTED = ["/dashboard", "/sales", "/tech", "/customers", "/portal", "/manager", "/my-projects", "/users", "/activity", "/inventory", "/tickets", "/projects", "/notifications", "/finances", "/expenses", "/support", "/tech-support"];

export async function middleware(request) {
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

export const config = {
  matcher: ["/dashboard/:path*", "/sales/:path*", "/tech/:path*", "/customers/:path*", "/portal/:path*", "/manager/:path*", "/my-projects/:path*", "/users/:path*", "/activity/:path*", "/inventory/:path*", "/tickets/:path*", "/projects/:path*", "/notifications/:path*", "/finances/:path*", "/expenses/:path*", "/support/:path*", "/tech-support/:path*", "/tech-support"],
};
