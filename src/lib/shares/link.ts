import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { sha256Hex } from "@/lib/auth/pat";

export const SHARE_PUBLIC_READS_PER_MINUTE = 30;
export const LINK_EXPIRY_DAYS = [1, 7, 30] as const;
export const DEFAULT_LINK_DAYS = 7;
export const MAX_LINK_DAYS = 30;
export const PASSCODE_UNLOCK_MS = 15 * 60 * 1000;
export const MAX_PASSCODE_FAILURES = 10;
export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 32;

export type LinkExpiryDays = (typeof LINK_EXPIRY_DAYS)[number];

export function clampLinkDays(days: number | null | undefined): LinkExpiryDays {
  if (days === 1 || days === 30) return days;
  return DEFAULT_LINK_DAYS;
}

export function linkExpiresAt(days: number, now: Date): Date {
  const clamped = Math.min(Math.max(days, 1), MAX_LINK_DAYS);
  return new Date(now.getTime() + clamped * 24 * 60 * 60 * 1000);
}

export type LinkView = {
  revokedAt: Date | string | null;
  expiresAt: Date | string;
  maxViews: number | null;
  viewCount: number;
  passcodeHash: string | null;
  passcodeFailures: number;
  /** True when the visitor already unlocked this link within the last 15 minutes. */
  unlocked: boolean;
  now: Date;
};

export type LinkDecision =
  | { ok: true }
  | { ok: false; code: "share_gone"; reason: "revoked" | "expired" | "exhausted" | "passcode_locked" }
  | { ok: false; code: "share_passcode_required" };

function at(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Pure link state machine. Callers persist `revoked_at` when failures hit the cap;
 * this function also treats that cap as gone so a stale row cannot be read.
 */
export function decideLinkAccess(link: LinkView): LinkDecision {
  if (at(link.revokedAt)) return { ok: false, code: "share_gone", reason: "revoked" };
  const expires = at(link.expiresAt);
  if (!expires || expires.getTime() <= link.now.getTime()) {
    return { ok: false, code: "share_gone", reason: "expired" };
  }
  if (link.maxViews != null && link.viewCount >= link.maxViews) {
    return { ok: false, code: "share_gone", reason: "exhausted" };
  }
  if (link.passcodeFailures >= MAX_PASSCODE_FAILURES) {
    return { ok: false, code: "share_gone", reason: "passcode_locked" };
  }
  if (link.passcodeHash && !link.unlocked) return { ok: false, code: "share_passcode_required" };
  return { ok: true };
}

export function nextViewCount(viewCount: number, maxViews: number | null): { count: number; exhausted: boolean } {
  const count = viewCount + 1;
  return { count, exhausted: maxViews != null && count > maxViews };
}

export function assertPasscodeShape(passcode: string | null | undefined): string | null {
  if (passcode == null || passcode === "") return null;
  if (passcode.length < PASSCODE_MIN || passcode.length > PASSCODE_MAX) {
    throw new Error("口令需要 4 到 32 个字符");
  }
  return passcode;
}

/** scrypt so a short share passcode is not a bare hash. */
export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex || saltHex.length !== 32) return false;
  const actual = scryptSync(passcode, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Plaintext is returned once. Only the sha256 hex is stored. */
export function generateShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

/**
 * Revoke clears snapshots and links. Copies the recipient already saved stay.
 * This is the invariant B10 tests without a database.
 */
export function applyRevoke<T extends { id: string }>(state: {
  snapshots: Array<unknown>;
  linksOpen: boolean[];
  pendingInboxIds: string[];
  copies: readonly T[];
}): { snapshots: null[]; linksOpen: boolean[]; pendingInboxIds: string[]; copies: T[] } {
  return {
    snapshots: state.snapshots.map(() => null),
    linksOpen: state.linksOpen.map(() => false),
    pendingInboxIds: [],
    copies: state.copies.map((copy) => ({ ...copy })),
  };
}
