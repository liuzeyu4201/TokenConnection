import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";

import { isAccountLocked, lockoutAfterFailure } from "./password-policy";

export type LoginIdentity = { email?: string | null; username?: string | null };

export async function findUserByIdentity(identity: LoginIdentity) {
  if (identity.email?.trim()) {
    const email = identity.email.trim().toLowerCase();
    const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    return row ?? null;
  }
  if (identity.username?.trim()) {
    const username = identity.username.trim().toLowerCase();
    const [row] = await db.select().from(users).where(sql`lower(${users.username}) = ${username}`).limit(1);
    return row ?? null;
  }
  return null;
}

export function loginBlockReason(user: { status: string; banned: boolean; lockedUntil: Date | null } | null): string | null {
  if (!user) return null;
  if (user.status === "disabled" || user.banned) return "该账号已停用，请联系管理员";
  if (isAccountLocked(user.lockedUntil)) return "尝试过多，15 分钟后再试";
  return null;
}

/** Count a password attempt. Unknown identities only write a failed-login audit. */
export async function notePasswordAttempt(identity: LoginIdentity, ok: boolean, ip?: string | null): Promise<void> {
  const user = await findUserByIdentity(identity);
  if (!user) {
    if (!ok) await audit({ action: "auth.login.failed", ip, meta: { method: "password" } });
    return;
  }
  if (ok) {
    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await audit({ action: "auth.login.success", actorUserId: user.id, ip, meta: { method: "password" } });
    return;
  }
  const next = lockoutAfterFailure(user.failedLoginCount ?? 0);
  await db.update(users).set(next).where(eq(users.id, user.id));
  await audit({
    action: next.lockedUntil ? "auth.account.locked" : "auth.login.failed",
    actorUserId: user.id,
    subjectUserId: user.id,
    ip,
    meta: { method: "password", failed: next.failedLoginCount },
  });
}
