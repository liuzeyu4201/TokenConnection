import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];
const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/two-factor", "/setup", "/api/auth", "/api/v1"];

function isPublic(pathname: string) {
  if (pathname === "/s" || pathname.startsWith("/s/")) return true;
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
 * Nonce CSP (Next.js proxy guide). `style-src-attr 'unsafe-inline'` stays so
 * the d3 map can set element styles. Dev keeps `unsafe-eval` for React.
 * `upgrade-insecure-requests` is production-only; on http://localhost it would
 * break the page.
 */
function contentSecurityPolicy() {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const value = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  return { nonce, value };
}

function applyCsp(response: NextResponse, value: string) {
  response.headers.set("Content-Security-Policy", value);
  return response;
}

/**
 * Optimistic gate only: a session cookie exists, or the route is public.
 * The real check is requireUser() / getAuthContext(). Login-page redirects for
 * an already valid session live in the page, so a stale cookie cannot loop.
 */
export function proxy(request: NextRequest) {
  const { nonce, value } = contentSecurityPolicy();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", value);

  const { pathname, search } = request.nextUrl;
  if (!isPublic(pathname) && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return clearLegacy(applyCsp(NextResponse.redirect(url), value), request);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return clearLegacy(applyCsp(response, value), request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
