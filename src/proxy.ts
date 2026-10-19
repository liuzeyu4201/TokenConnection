import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];
const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/setup", "/api/auth", "/api/v1"];

function isPublic(pathname: string) {
  return PUBLIC.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function clearLegacy(response: NextResponse, request: NextRequest) {
  if (request.cookies.has("tc_token")) {
    response.cookies.set("tc_token", "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return response;
}

/**
 * Optimistic gate only: a session cookie exists, or the route is public.
 * The real check is requireUser() / getAuthContext(). Login-page redirects for
 * an already valid session live in the page, so a stale cookie cannot loop.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isPublic(pathname) && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return clearLegacy(NextResponse.redirect(url), request);
  }
  return clearLegacy(NextResponse.next(), request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
