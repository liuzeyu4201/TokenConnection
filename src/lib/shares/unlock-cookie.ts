import { createHmac, timingSafeEqual } from "node:crypto";

import { sha256Hex } from "@/lib/auth/pat";

import { PASSCODE_UNLOCK_MS } from "./link";

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("缺少 BETTER_AUTH_SECRET");
  return value;
}

export function shareUnlockCookieName(token: string): string {
  return `tc_su_${sha256Hex(token).slice(0, 12)}`;
}

/** HttpOnly cookie that proves this browser entered the link passcode. */
export function shareUnlockCookie(token: string): { name: string; value: string; maxAge: number } {
  const hash = sha256Hex(token);
  const value = createHmac("sha256", secret()).update(hash).digest("base64url");
  return { name: shareUnlockCookieName(token), value, maxAge: Math.floor(PASSCODE_UNLOCK_MS / 1000) };
}

export function shareCookieMatches(token: string, cookieValue: string | undefined): boolean {
  if (!cookieValue || !process.env.BETTER_AUTH_SECRET) return false;
  const expected = shareUnlockCookie(token).value;
  const left = Buffer.from(cookieValue);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
