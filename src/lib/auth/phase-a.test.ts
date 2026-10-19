import { describe, expect, it } from "vitest";

import { isSessionAbsolutelyExpired } from "./session-policy";
import { isAccountLocked, lockoutAfterFailure, passwordProblems } from "./password-policy";
import { csrfAllows } from "./csrf";
import { startupRoleDecision } from "./rls-check";
import { consumeWindow } from "./rate-limit";
import { isOverQuota } from "@/lib/llm/quota";
import { mergeRedactedContacts, redactContacts, restorePlaceholders } from "@/lib/llm/redact";

describe("session absolute expiry", () => {
  it("expires a session that has lived past the absolute window", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-07-02T00:00:00Z");
    expect(isSessionAbsolutelyExpired(created, now, 180)).toBe(true);
    expect(isSessionAbsolutelyExpired(created, new Date("2026-06-01T00:00:00Z"), 180)).toBe(false);
  });
});

describe("password policy and lockout", () => {
  it("rejects short passwords and passwords equal to the email or username", () => {
    expect(passwordProblems("short", {})).toEqual(["密码至少 10 位"]);
    expect(passwordProblems("user@example.com", { email: "user@example.com" })).toContain("密码不能与邮箱相同");
    expect(passwordProblems("longenough", { username: "longenough" })).toContain("密码不能与用户名相同");
  });

  it("locks the account on the 10th failure for 15 minutes", () => {
    const now = new Date("2026-10-19T00:00:00Z");
    expect(lockoutAfterFailure(8, now).lockedUntil).toBeNull();
    const locked = lockoutAfterFailure(9, now);
    expect(locked.failedLoginCount).toBe(10);
    expect(isAccountLocked(locked.lockedUntil, now)).toBe(true);
    expect(isAccountLocked(locked.lockedUntil, new Date(now.getTime() + 16 * 60 * 1000))).toBe(false);
  });
});

describe("csrf", () => {
  it("allows same-origin fetches and rejects a foreign origin", () => {
    expect(csrfAllows({ method: "GET", origin: "https://evil.test", secFetchSite: "cross-site", host: "app.test" })).toBe(true);
    expect(csrfAllows({ method: "POST", origin: null, secFetchSite: "same-origin", host: "app.test" })).toBe(true);
    expect(csrfAllows({ method: "POST", origin: "https://evil.test", secFetchSite: "cross-site", host: "app.test" })).toBe(false);
    expect(csrfAllows({ method: "POST", origin: "https://app.test", secFetchSite: "cross-site", host: "app.test" })).toBe(true);
  });
});

describe("database role self-check", () => {
  it("refuses a bypass role in production and warns in development", () => {
    expect(startupRoleDecision({ rolsuper: true, rolbypassrls: false }, "production")).toBe("refuse");
    expect(startupRoleDecision({ rolsuper: false, rolbypassrls: true }, "development")).toBe("warn");
    expect(startupRoleDecision({ rolsuper: false, rolbypassrls: false }, "production")).toBe("ok");
  });
});

describe("rate window", () => {
  it("rejects the 11th call inside the window", () => {
    let hits: number[] = [];
    for (let i = 0; i < 10; i++) hits = consumeWindow(1_000 + i, hits, 60_000, 10).hits;
    const blocked = consumeWindow(1_020, hits, 60_000, 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("quota", () => {
  it("is over quota when the counter has reached the cap", () => {
    expect(isOverQuota({ extract_count: 200, vision_count: 0, embed_count: 0 }, { extract: 200, vision: 30, embed: 500 }, "extract")).toBe(true);
    expect(isOverQuota({ extract_count: 199, vision_count: 0, embed_count: 0 }, { extract: 200, vision: 30, embed: 500 }, "extract")).toBe(false);
  });
});

describe("contact redaction", () => {
  it("removes phones, emails and wechat ids, then restores them into contacts", () => {
    const raw = "微信 wxid_abcde 电话 13812345678 邮箱 a@b.com";
    const redacted = redactContacts(raw);
    expect(redacted.text).not.toContain("13812345678");
    expect(redacted.text).not.toContain("wxid_abcde");
    expect(redacted.text).not.toContain("a@b.com");
    expect(restorePlaceholders(redacted.text, redacted.replacements)).toContain("13812345678");
    const contacts = mergeRedactedContacts({}, redacted.replacements);
    expect(contacts.phone).toBe("13812345678");
    expect(contacts.wechat).toBe("wxid_abcde");
    expect(contacts.email).toBe("a@b.com");
  });
});
