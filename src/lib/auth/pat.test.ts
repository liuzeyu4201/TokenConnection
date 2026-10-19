import { describe, expect, it } from "vitest";

import { generatePat, hashPat, isPatToken, isTokenExpired, isTokenRevoked, parseScopeList, scopesAllow, tokenPrefix } from "./pat";

describe("personal access tokens", () => {
  it("mints a tcp_ token, stores only a sha256, and keeps a 12-char prefix", () => {
    const minted = generatePat();
    expect(isPatToken(minted.token)).toBe(true);
    expect(minted.token.startsWith("tcp_")).toBe(true);
    expect(minted.prefix).toBe(tokenPrefix(minted.token));
    expect(minted.prefix).toHaveLength(12);
    expect(minted.hash).toBe(hashPat(minted.token));
    expect(minted.hash).not.toContain(minted.token);
  });

  it("treats a past expiry as expired and a missing expiry as open", () => {
    const now = new Date("2026-10-19T00:00:00Z");
    expect(isTokenExpired(new Date("2026-10-18T00:00:00Z"), now)).toBe(true);
    expect(isTokenExpired(new Date("2026-10-20T00:00:00Z"), now)).toBe(false);
    expect(isTokenExpired(null, now)).toBe(false);
    expect(isTokenRevoked(new Date())).toBe(true);
    expect(isTokenRevoked(null)).toBe(false);
  });

  it("rejects unknown scopes and missing scopes", () => {
    expect(parseScopeList(["inbox:write"]).ok).toBe(true);
    expect(parseScopeList(["nope"])).toEqual({ ok: false, unknown: "nope" });
    expect(parseScopeList([])).toEqual({ ok: false, unknown: "" });
    expect(scopesAllow(["people:read"], "people:read")).toBe(true);
    expect(scopesAllow(["people:read"], "people:write")).toBe(false);
  });
});
