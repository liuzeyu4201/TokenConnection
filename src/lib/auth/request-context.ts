import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { audit, clientIp } from "@/lib/audit";

import { instanceHasUsers } from "./bootstrap";
import { hasScope, isScope, type Scope, type ServiceContext } from "./context";
import { extractBearer, hashPat, isTokenExpired, isTokenRevoked } from "./pat";
import { auth } from "./server";
import { isSessionAbsolutelyExpired, readAbsoluteDays } from "./session-policy";

export type AuthRejection = {
  status: number;
  code: string;
  message: string;
};

function reject(status: number, code: string, message: string): AuthRejection {
  return { status, code, message };
}

function isRejection(value: ServiceContext | AuthRejection): value is AuthRejection {
  return "status" in value && "code" in value;
}

export { isRejection };

type SessionUser = {
  id: string;
  role?: string | null;
  status?: string | null;
  banned?: boolean | null;
};

function toContext(user: SessionUser, sessionId: string): ServiceContext {
  return {
    userId: user.id,
    role: user.role === "admin" ? "admin" : "member",
    via: "session",
    sessionId,
  };
}

export async function sessionContextFromHeaders(headerStore: Headers): Promise<ServiceContext | AuthRejection | null> {
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) return null;
  const user = session.user as typeof session.user & SessionUser;
  if (isSessionAbsolutelyExpired(new Date(session.session.createdAt), new Date(), readAbsoluteDays())) {
    await auth.api.revokeSession({ headers: headerStore, body: { token: session.session.token } }).catch(() => undefined);
    return reject(401, "unauthorized", "登录已过期，请重新登录");
  }
  if (user.status === "disabled" || user.banned) {
    await auth.api.revokeSessions({ headers: headerStore }).catch(() => undefined);
    return reject(403, "account_disabled", "该账号已停用，请联系管理员");
  }
  return toContext(user, session.session.id);
}

async function patContext(request: Request, token: string): Promise<ServiceContext | AuthRejection> {
  const hash = hashPat(token);
  const [row] = await db
    .select({
      id: apiTokens.id,
      user_id: apiTokens.user_id,
      scopes: apiTokens.scopes,
      expires_at: apiTokens.expires_at,
      revoked_at: apiTokens.revoked_at,
      last_used_at: apiTokens.last_used_at,
      status: users.status,
      banned: users.banned,
      role: users.role,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.user_id))
    .where(and(eq(apiTokens.token_hash, hash), isNull(apiTokens.revoked_at)))
    .limit(1);

  if (!row) {
    const [revoked] = await db
      .select({ id: apiTokens.id, revoked_at: apiTokens.revoked_at, expires_at: apiTokens.expires_at })
      .from(apiTokens)
      .where(eq(apiTokens.token_hash, hash))
      .limit(1);
    if (revoked && isTokenRevoked(revoked.revoked_at)) {
      return reject(401, "token_revoked", "令牌已撤销");
    }
    if (revoked && isTokenExpired(revoked.expires_at)) {
      return reject(401, "token_expired", "令牌已过期");
    }
    return reject(401, "unauthorized", "令牌无效");
  }
  if (isTokenExpired(row.expires_at)) return reject(401, "token_expired", "令牌已过期");
  if (row.status === "disabled" || row.banned) return reject(403, "account_disabled", "该账号已停用，请联系管理员");

  const now = new Date();
  const stale = !row.last_used_at || now.getTime() - row.last_used_at.getTime() > 5 * 60 * 1000;
  if (stale) {
    await db
      .update(apiTokens)
      .set({ last_used_at: now, last_used_ip: clientIp(request.headers) })
      .where(eq(apiTokens.id, row.id));
    const dayKey = now.toISOString().slice(0, 10);
    const usedToday = row.last_used_at && row.last_used_at.toISOString().slice(0, 10) === dayKey;
    if (!usedToday) {
      await audit({
        action: "token.used",
        actorUserId: row.user_id,
        targetType: "api_token",
        targetId: row.id,
        ip: clientIp(request.headers),
      });
    }
  }

  const scopes = row.scopes.filter(isScope);
  return {
    userId: row.user_id,
    role: row.role === "admin" ? "admin" : "member",
    via: "pat",
    scopes,
    tokenId: row.id,
  };
}

export async function resolveAuth(request: Request): Promise<ServiceContext | AuthRejection> {
  if (!(await instanceHasUsers())) {
    return reject(503, "setup_required", "实例尚未初始化，请先打开 /setup");
  }
  const bearer = extractBearer(request.headers.get("authorization"));
  if (bearer) return patContext(request, bearer);
  const session = await sessionContextFromHeaders(request.headers);
  if (!session) return reject(401, "unauthorized", "未登录");
  if (isRejection(session)) return session;
  return session;
}

export async function requireAuthContext(request: Request): Promise<ServiceContext> {
  const result = await resolveAuth(request);
  if (isRejection(result)) throw new ApiError(result.status, result.code, result.message);
  return result;
}

export function assertScope(ctx: ServiceContext, scope: Scope): void {
  if (hasScope(ctx, scope)) return;
  throw new ApiError(403, "insufficient_scope", `需要权限 ${scope}`);
}

export function assertSession(ctx: ServiceContext): void {
  if (ctx.via !== "session") throw new ApiError(403, "forbidden", "此操作需要在网页里登录后进行");
}

export function assertAdmin(ctx: ServiceContext): void {
  assertSession(ctx);
  if (ctx.role !== "admin") throw new ApiError(403, "forbidden", "需要管理员权限");
}
