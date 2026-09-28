import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { ApiError, badRequest } from "./errors";

/** Success helper: plain JSON body, no envelope (design.md §8). */
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
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
    return errorResponse(error.status, error.code, error.message);
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
      case "ECONNREFUSED":
      case "ENOTFOUND":
        return errorResponse(503, "database_unavailable", "数据库不可用，请确认 docker compose 已启动");
    }
  }
  console.error("[api] unhandled error:", error);
  return errorResponse(500, "internal_error", "服务器内部错误");
}

/** Wrap a route handler so every thrown error becomes a JSON error response. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleError(error);
    }
  };
}

/** Parse a JSON body, rejecting empty or malformed payloads with 400. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) throw badRequest("请求体不能为空", "invalid_json");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("请求体不是合法的 JSON", "invalid_json");
  }
}

/** Validate a JSON body against a zod schema (throws ZodError → 400). */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const raw = await readJson(request);
  return schema.parse(raw);
}

/** Validate query-string parameters (single values only). */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!(key in params)) params[key] = value;
  }
  return schema.parse(params);
}

/** Path params are strings; validate UUIDs early for a clean 400. */
export function requireUuid(value: string, label = "id"): string {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(value)) throw badRequest(`${label} 不是合法的 UUID`, "invalid_input");
  return value;
}
