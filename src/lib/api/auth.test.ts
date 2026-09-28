import { describe, expect, it } from "vitest";

import { checkAuth, extractBearer, safeEqual } from "./auth";

describe("bearer token auth (design.md §8)", () => {
  const expectedToken = "secret-token";

  it("accepts a matching Authorization header", () => {
    expect(
      checkAuth({ authorizationHeader: "Bearer secret-token", cookieToken: undefined, expectedToken }),
    ).toEqual({ ok: true, via: "bearer" });
    expect(extractBearer("bearer   secret-token ")).toBe("secret-token");
  });

  it("accepts the same token from the web cookie", () => {
    expect(checkAuth({ authorizationHeader: null, cookieToken: "secret-token", expectedToken })).toEqual({
      ok: true,
      via: "cookie",
    });
  });

  it("rejects missing or wrong tokens and prefers the header when both are present", () => {
    expect(checkAuth({ authorizationHeader: null, cookieToken: null, expectedToken })).toEqual({
      ok: false,
      reason: "missing_token",
    });
    expect(checkAuth({ authorizationHeader: "Bearer nope", cookieToken: "secret-token", expectedToken })).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    expect(checkAuth({ authorizationHeader: "Basic abc", cookieToken: "wrong", expectedToken })).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("fails closed when API_TOKEN is not configured", () => {
    expect(
      checkAuth({ authorizationHeader: "Bearer anything", cookieToken: undefined, expectedToken: undefined }),
    ).toEqual({ ok: false, reason: "missing_config" });
    expect(checkAuth({ authorizationHeader: null, cookieToken: null, expectedToken: "  " })).toEqual({
      ok: false,
      reason: "missing_config",
    });
  });

  it("safeEqual compares strings without early exit on length-equal inputs", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
