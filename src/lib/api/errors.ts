/**
 * Error type shared by services and API routes. Route handlers turn it into
 * `{ error: { code, message } }` with the given HTTP status (design.md §8).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const notFound = (message = "资源不存在") =>
  new ApiError(404, "not_found", message);

export const badRequest = (message: string, code = "bad_request") =>
  new ApiError(400, code, message);

export const conflict = (message: string) => new ApiError(409, "conflict", message);

export const unauthorized = (message = "未授权：缺少或错误的 Bearer token") =>
  new ApiError(401, "unauthorized", message);

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
