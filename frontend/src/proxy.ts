import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = ["/dashboard", "/doctors", "/patients"];

export function proxy(request: NextRequest) {
  const protectedRoute = protectedPaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`));
  if (protectedRoute && !request.cookies.has("doctor_tracker_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/doctors/:path*", "/patients/:path*"] };
