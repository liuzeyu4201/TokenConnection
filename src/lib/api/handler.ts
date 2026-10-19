import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

import type { Scope, ServiceContext } from "@/lib/auth/context";
import { csrfAllows } from "@/lib/auth/csrf";
import { consumeMemoryLimit } from "@/lib/auth/rate-limit";
import { assertAdmin, assertScope, assertSession, requireAuthContext } from "@/lib/auth/request-context";

import { ApiError, badRequest } from "./errors";

/** Success helper: plain JSON body, no envelope (design.md §8). */
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

type PgError = { code?: string; message?: string; detail?: string };

function isPgError(error: unknown): error is PgError {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as PgError).code === "string";
}

/** Map any thrown value to the unified error shape. */
export function handleError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const headers = error.code === "rate_limited" || error.code === "quota_exceeded" ? { "Retry-After": "60" } : undefined;
    return errorResponse(error.status, error.code, error.message, headers);
  }
  if (error instanceof ZodError) {
    return errorResponse(400, "validation_error", formatZodError(error));
  }
  if (isPgError(error)) {
    switch (error.code) {
      case "23505":
        return errorResponse(409, "conflict", "已存在相同的记录");
      case "23503":
        return errorResponse(400, "invalid_reference", "引用的记录不存在");
      case "22P02":
        return errorResponse(400, "invalid_input", "参数格式不正确（例如不是合法的 UUID）");
      case "42501":
        return errorResponse(404, "not_found", "资源不存在");
      case "ECONNREFUSED":
      case "ENOTFOUND":
        return errorResponse(503, "database_unavailable", "数据库不可用，请确认 docker compose 已启动");
    }
  }
  console.error("[api] unhandled error:", error);
  return errorResponse(500, "internal_error", "服务器内部错误");
}

export type RouteOptions = {
  scope?: Scope;
  /** PAT is rejected. Tokens, sessions, account and admin routes. */
  session?: "required";
  admin?: boolean;
};

type RouteCtx = { params: Promise<Record<string, string>> };

/**
 * Authenticate, check scope / CSRF / rate limit, then run the handler.
 * The third argument is the tenant context.
 */
export function route<C extends RouteCtx = RouteCtx>(
  handler: (request: NextRequest, ctx: C, auth: ServiceContext) => Promise<Response>,
  options: RouteOptions = {},
): (request: NextRequest, ctx: C) => Promise<Response> {
  return async (request: NextRequest, ctx: C) => {
    try {
      const auth = await requireAuthContext(request);
      if (options.admin) assertAdmin(auth);
      else if (options.session === "required") assertSession(auth);
      if (options.scope) assertScope(auth, options.scope);
      if (
        auth.via === "session" &&
        !csrfAllows({
          method: request.method,
          origin: request.headers.get("origin"),
          secFetchSite: request.headers.get("sec-fetch-site"),
          host: request.headers.get("host"),
        })
      ) {
        throw new ApiError(403, "csrf_rejected", "跨站请求被拒绝");
      }
      const limit = auth.via === "pat" ? 120 : 300;
      const key = auth.via === "pat" ? `pat:${auth.tokenId}` : `ses:${auth.sessionId ?? auth.userId}`;
      const decision = consumeMemoryLimit(key, Date.now(), 60_000, limit);
      if (!decision.allowed) {
        return errorResponse(429, "rate_limited", "请求过于频繁，请稍后再试", {
          "Retry-After": String(decision.retryAfterSec),
        });
      }
      return await handler(request, ctx, auth);
    } catch (error) {
      return handleError(error);
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) throw badRequest("请求体不能为空", "invalid_json");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("请求体不是合法的 JSON", "invalid_json");
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const raw = await readJson(request);
  return schema.parse(raw);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!(key in params)) params[key] = value;
  }
  return schema.parse(params);
}

export function requireUuid(value: string, label = "id"): string {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(value)) throw badRequest(`${label} 不是合法的 UUID`, "invalid_input");
  return value;
}
