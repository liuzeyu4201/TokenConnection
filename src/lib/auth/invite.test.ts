import { describe, expect, it } from "vitest";

import { checkInvite, generateInviteCode, hashInviteCode } from "./invite";

const now = new Date("2026-10-19T12:00:00Z");

describe("invite checks", () => {
  it("hashes the code and accepts a live unbound invite", () => {
    const minted = generateInviteCode();
    expect(hashInviteCode(minted.code)).toBe(minted.hash);
    expect(
      checkInvite({ expiresAt: new Date("2026-10-20T00:00:00Z"), usedAt: null, revokedAt: null, email: null }, "a@b.c", now),
    ).toEqual({ ok: true });
  });

  it("rejects missing, expired, used, revoked, and mismatched invites", () => {
    const base = { expiresAt: new Date("2026-10-20T00:00:00Z"), usedAt: null, revokedAt: null, email: "a@b.c" };
    expect(checkInvite(null, "a@b.c", now).ok).toBe(false);
    expect(checkInvite({ ...base, expiresAt: new Date("2026-10-18T00:00:00Z") }, "a@b.c", now)).toEqual({ ok: false, reason: "expired" });
    expect(checkInvite({ ...base, usedAt: now }, "a@b.c", now)).toEqual({ ok: false, reason: "used" });
    expect(checkInvite({ ...base, revokedAt: now }, "a@b.c", now)).toEqual({ ok: false, reason: "revoked" });
    expect(checkInvite(base, "other@b.c", now)).toEqual({ ok: false, reason: "email_mismatch" });
    expect(checkInvite(base, "A@b.c", now)).toEqual({ ok: true });
  });
});
