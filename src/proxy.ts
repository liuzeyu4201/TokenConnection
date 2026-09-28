import { NextResponse, type NextRequest } from "next/server";

import { API_PREFIX, authFailureMessage, checkAuth, TOKEN_COOKIE_NAME } from "@/lib/api/auth";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * - `/api/v1/*`: require the bearer token (header) or the same token in the
 *   `tc_token` cookie (web UI). Otherwise respond 401 in the standard error
 *   shape.
 * - Pages: make sure the browser has the cookie so client components can call
 *   the API. Pages themselves are not protected in stage 1 (design.md §8).
 */
export function proxy(request: NextRequest) {
  const expected = process.env.API_TOKEN;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(API_PREFIX)) {
    const result = checkAuth({
      authorizationHeader: request.headers.get("authorization"),
      cookieToken: request.cookies.get(TOKEN_COOKIE_NAME)?.value,
      expectedToken: expected,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: authFailureMessage(result.reason) } },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      );
    }
    return NextResponse.next();
  }

  const response = NextResponse.next();
  if (expected && request.cookies.get(TOKEN_COOKIE_NAME)?.value !== expected) {
    response.cookies.set(TOKEN_COOKIE_NAME, expected, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
