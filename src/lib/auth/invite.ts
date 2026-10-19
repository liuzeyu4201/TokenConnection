import { randomBytes } from "node:crypto";

import { sha256Hex } from "./pat";

export const INVITE_DEFAULT_DAYS = 7;

export type InviteCheckReason = "missing" | "expired" | "used" | "revoked" | "email_mismatch";

export type InviteSnapshot = {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  email: string | null;
};

export function generateInviteCode(): { code: string; hash: string } {
  const code = randomBytes(32).toString("base64url");
  return { code, hash: sha256Hex(code) };
}

export function hashInviteCode(code: string): string {
  return sha256Hex(code.trim());
}

/**
 * Pure invite gate. `submittedEmail` is the address on the signup form.
 * A bound invite email must match; an unbound invite accepts any address.
 */
export function checkInvite(
  invite: InviteSnapshot | null,
  submittedEmail: string,
  now = new Date(),
): { ok: true } | { ok: false; reason: InviteCheckReason } {
  if (!invite) return { ok: false, reason: "missing" };
  if (invite.revokedAt) return { ok: false, reason: "revoked" };
  if (invite.usedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (invite.email && invite.email.toLowerCase() !== submittedEmail.trim().toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true };
}

export function inviteFailureMessage(reason: InviteCheckReason): string {
  switch (reason) {
    case "missing":
      return "邀请码无效";
    case "expired":
      return "邀请码已过期";
    case "used":
      return "邀请码已使用";
    case "revoked":
      return "邀请码已撤销";
    case "email_mismatch":
      return "这个邀请码绑定了别的邮箱";
  }
}
