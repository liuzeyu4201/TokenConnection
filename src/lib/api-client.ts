/**
 * Minimal same-origin fetch helper for client components. Authentication is
 * handled by the `tc_token` cookie set in src/proxy.ts, so no token handling
 * is needed here.
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

type ApiFetchInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    signal: init.signal,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiClientError(
      response.status,
      err?.code ?? "http_error",
      err?.message ?? `请求失败（HTTP ${response.status}）`,
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}
