/**
 * Stage-1 authentication (design.md §8, D-10): every `/api/v1/*` request must
 * carry `Authorization: Bearer <API_TOKEN>`. The web UI gets the same token
 * as a same-site HttpOnly cookie, set by src/proxy.ts on page loads.
 */

export const TOKEN_COOKIE_NAME = "tc_token";
export const API_PREFIX = "/api/v1";

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function extractBearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export type AuthCheckInput = {
  authorizationHeader: string | null | undefined;
  cookieToken: string | null | undefined;
  expectedToken: string | undefined;
};

export type AuthCheckResult =
  | { ok: true; via: "bearer" | "cookie" }
  | { ok: false; reason: "missing_config" | "missing_token" | "invalid_token" };

export function checkAuth(input: AuthCheckInput): AuthCheckResult {
  const expected = input.expectedToken?.trim();
  if (!expected) return { ok: false, reason: "missing_config" };

  const bearer = extractBearer(input.authorizationHeader);
  if (bearer) {
    return safeEqual(bearer, expected)
      ? { ok: true, via: "bearer" }
      : { ok: false, reason: "invalid_token" };
  }
  const cookie = input.cookieToken?.trim();
  if (cookie) {
    return safeEqual(cookie, expected)
      ? { ok: true, via: "cookie" }
      : { ok: false, reason: "invalid_token" };
  }
  return { ok: false, reason: "missing_token" };
}

export function authFailureMessage(reason: Extract<AuthCheckResult, { ok: false }>["reason"]): string {
  switch (reason) {
    case "missing_config":
      return "服务端未配置 API_TOKEN，请在 .env 中设置";
    case "missing_token":
      return "缺少 Authorization: Bearer <API_TOKEN>";
    case "invalid_token":
      return "token 错误";
  }
}
