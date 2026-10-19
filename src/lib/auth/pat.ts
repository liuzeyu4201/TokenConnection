import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { SCOPES, isScope, type Scope } from "./context";

export const PAT_PREFIX = "tcp_";
/** First 12 characters (`tcp_` + 8) shown in the token list. */
export const PAT_PREFIX_LENGTH = 12;
export const PAT_RANDOM_BYTES = 32;
export const MAX_TOKENS_PER_USER = 20;
export const LEGACY_TOKEN_DAYS = 90;
export const LEGACY_TOKEN_NAME = "旧 API_TOKEN（自动迁移）";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time compare for equal-length strings. Unequal lengths return false. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function extractBearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function isPatToken(token: string): boolean {
  return token.startsWith(PAT_PREFIX) && token.length > PAT_PREFIX.length;
}

export function tokenPrefix(token: string): string {
  return token.slice(0, PAT_PREFIX_LENGTH);
}

/** `tcp_` + 32 random bytes of base64url (43 characters). Plaintext is shown once. */
export function generatePat(): { token: string; prefix: string; hash: string } {
  const token = PAT_PREFIX + randomBytes(PAT_RANDOM_BYTES).toString("base64url");
  return { token, prefix: tokenPrefix(token), hash: sha256Hex(token) };
}

export function hashPat(token: string): string {
  return sha256Hex(token);
}

export function isTokenExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}

export function isTokenRevoked(revokedAt: Date | null | undefined): boolean {
  return revokedAt != null;
}

export function expiryFromDays(days: number | null | undefined, now = new Date()): Date | null {
  if (days == null) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function scopesAllow(granted: readonly string[] | null | undefined, required: Scope): boolean {
  if (!granted) return false;
  return granted.includes(required);
}

export function allScopes(): Scope[] {
  return [...SCOPES];
}

export function parseScopeList(values: readonly string[]): { ok: true; scopes: Scope[] } | { ok: false; unknown: string } {
  const scopes: Scope[] = [];
  for (const value of values) {
    if (!isScope(value)) return { ok: false, unknown: value };
    if (!scopes.includes(value)) scopes.push(value);
  }
  if (scopes.length === 0) return { ok: false, unknown: "" };
  return { ok: true, scopes };
}
