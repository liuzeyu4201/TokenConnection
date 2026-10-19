import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { apiTokens, invites, sessions, users } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";

import type { Scope, ServiceContext } from "./context";
import { assertAdmin } from "./request-context";
import {
  MAX_TOKENS_PER_USER,
  allScopes,
  expiryFromDays,
  generatePat,
  parseScopeList,
} from "./pat";
import { INVITE_DEFAULT_DAYS, generateInviteCode } from "./invite";

export async function getProfile(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function contentCounts(): Promise<{ people: number; tags: number }> {
  const [row] = await db.execute<{ people: number; tags: number }>(sql`
    select (select count(*)::int from people) as people, (select count(*)::int from tags) as tags
  `);
  return { people: Number(row?.people ?? 0), tags: Number(row?.tags ?? 0) };
}

export async function listTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      token_prefix: apiTokens.token_prefix,
      scopes: apiTokens.scopes,
      expires_at: apiTokens.expires_at,
      last_used_at: apiTokens.last_used_at,
      revoked_at: apiTokens.revoked_at,
      legacy: apiTokens.legacy,
      created_at: apiTokens.created_at,
    })
    .from(apiTokens)
    .where(eq(apiTokens.user_id, userId))
    .orderBy(desc(apiTokens.created_at));
}

export async function createToken(
  ctx: ServiceContext,
  input: { name: string; scopes: string[]; expiresInDays: number | null },
) {
  if (ctx.via !== "session") throw new ApiError(403, "forbidden", "此操作需要在网页里登录后进行");
  const parsed = parseScopeList(input.scopes);
  if (!parsed.ok) throw new ApiError(400, "validation_error", parsed.unknown ? `未知权限 ${parsed.unknown}` : "请至少选择一个权限");
  const existing = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.user_id, ctx.userId), isNull(apiTokens.revoked_at)));
  if (existing.length >= MAX_TOKENS_PER_USER) throw new ApiError(400, "validation_error", "最多 20 个未撤销的令牌");
  const minted = generatePat();
  const [row] = await db
    .insert(apiTokens)
    .values({
      user_id: ctx.userId,
      name: input.name.trim(),
      token_prefix: minted.prefix,
      token_hash: minted.hash,
      scopes: parsed.scopes,
      expires_at: expiryFromDays(input.expiresInDays),
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      token_prefix: apiTokens.token_prefix,
      scopes: apiTokens.scopes,
      expires_at: apiTokens.expires_at,
      created_at: apiTokens.created_at,
    });
  await audit({ action: "token.created", actorUserId: ctx.userId, targetType: "api_token", targetId: row.id, meta: { legacy: false } });
  return { token: minted.token, item: row };
}

export async function revokeToken(ctx: ServiceContext, id: string) {
  if (ctx.via !== "session") throw new ApiError(403, "forbidden", "此操作需要在网页里登录后进行");
  const [row] = await db
    .update(apiTokens)
    .set({ revoked_at: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.user_id, ctx.userId), isNull(apiTokens.revoked_at)))
    .returning({ id: apiTokens.id });
  if (!row) throw new ApiError(404, "not_found", "令牌不存在");
  await audit({ action: "token.revoked", actorUserId: ctx.userId, targetType: "api_token", targetId: id });
}

export async function createInvite(
  ctx: ServiceContext,
  input: { email?: string | null; role?: string; days?: number },
  origin: string,
) {
  assertAdmin(ctx);
  const role = input.role === "admin" ? "admin" : "member";
  const days = input.days && input.days > 0 ? Math.min(input.days, 30) : INVITE_DEFAULT_DAYS;
  const minted = generateInviteCode();
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(invites)
    .values({
      code_hash: minted.hash,
      email: input.email?.trim() || null,
      role,
      created_by: ctx.userId,
      expires_at: expires,
    })
    .returning({ id: invites.id, email: invites.email, role: invites.role, expires_at: invites.expires_at });
  await audit({
    action: "admin.invite.created",
    actorUserId: ctx.userId,
    targetType: "invite",
    targetId: row.id,
    meta: { role },
  });
  return { ...row, url: `${origin}/register?invite=${encodeURIComponent(minted.code)}` };
}

export async function listInvites() {
  return db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expires_at: invites.expires_at,
      used_at: invites.used_at,
      revoked_at: invites.revoked_at,
      created_at: invites.created_at,
    })
    .from(invites)
    .orderBy(desc(invites.created_at));
}

export async function revokeInvite(ctx: ServiceContext, id: string) {
  assertAdmin(ctx);
  const [row] = await db
    .update(invites)
    .set({ revoked_at: new Date() })
    .where(and(eq(invites.id, id), isNull(invites.revoked_at), isNull(invites.used_at)))
    .returning({ id: invites.id });
  if (!row) throw new ApiError(404, "not_found", "邀请不存在或已结束");
  await audit({ action: "admin.invite.revoked", actorUserId: ctx.userId, targetType: "invite", targetId: id });
}

export async function listUsersForAdmin() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLogin: sql<Date | null>`(select max(${sessions.updatedAt}) from ${sessions} where ${sessions.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return rows;
}

async function adminCount(): Promise<number> {
  const [row] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from users where role = 'admin' and status = 'active' and banned = false
  `);
  return Number(row?.n ?? 0);
}

export async function setUserDisabled(ctx: ServiceContext, userId: string, disabled: boolean) {
  assertAdmin(ctx);
  if (ctx.userId === userId) throw new ApiError(400, "validation_error", "不能停用自己");
  const target = await getProfile(userId);
  if (!target) throw new ApiError(404, "not_found", "用户不存在");
  if (disabled && target.role === "admin" && target.status === "active" && (await adminCount()) <= 1) {
    throw new ApiError(400, "validation_error", "至少要保留一个管理员");
  }
  await db
    .update(users)
    .set({ status: disabled ? "disabled" : "active", banned: disabled, updatedAt: new Date() })
    .where(eq(users.id, userId));
  if (disabled) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.update(apiTokens).set({ revoked_at: new Date() }).where(and(eq(apiTokens.user_id, userId), isNull(apiTokens.revoked_at)));
  }
  await audit({
    action: disabled ? "admin.user.disabled" : "admin.user.enabled",
    actorUserId: ctx.userId,
    subjectUserId: userId,
    targetType: "user",
    targetId: userId,
  });
}

export async function findInvite(code: string) {
  const { hashInviteCode } = await import("./invite");
  const [row] = await db.select().from(invites).where(eq(invites.code_hash, hashInviteCode(code))).limit(1);
  return row ?? null;
}

export function fullScopes(): Scope[] {
  return allScopes();
}

export async function latestResetLink(userId: string) {
  const { pendingResetLinks } = await import("@/db/schema");
  const { decryptSecret } = await import("./secret-box");
  const [row] = await db
    .select()
    .from(pendingResetLinks)
    .where(and(eq(pendingResetLinks.user_id, userId), isNull(pendingResetLinks.consumed_at)))
    .orderBy(desc(pendingResetLinks.created_at))
    .limit(1);
  if (!row || row.expires_at.getTime() <= Date.now()) return null;
  return { expires_at: row.expires_at, url: decryptSecret(row.url_encrypted) };
}

