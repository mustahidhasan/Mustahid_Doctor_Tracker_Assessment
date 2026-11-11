import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "doctor_tracker_session";
const protectedPaths = ["/dashboard", "/doctors", "/patients"];

/**
 * Route gate (cookie presence only — the API validates the JWT on every request):
 * - protected pages without a session cookie -> /login?next=<path>
 * - /login with a session cookie -> /dashboard (no client-side /api/auth/me round trip),
 *   except when the app sent the user here because the session expired (?expired=1),
 *   which prevents a redirect loop if a stale cookie could not be cleared.
 */
export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname === "/login") {
    if (hasSession && searchParams.get("expired") !== "1") return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  const isProtected = protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (isProtected && !hasSession) {
    const target = new URL("/login", request.url);
    target.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/dashboard/:path*", "/doctors/:path*", "/patients/:path*"] };
