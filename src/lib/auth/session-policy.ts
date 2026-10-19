const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_IDLE_DAYS = 30;
export const DEFAULT_ABSOLUTE_DAYS = 180;

export function sessionIdleSeconds(days = DEFAULT_IDLE_DAYS): number {
  return days * 24 * 60 * 60;
}

export function sessionUpdateAgeSeconds(): number {
  return 24 * 60 * 60;
}

/** Absolute lifetime, measured from `sessions.created_at`, even if the idle window keeps sliding. */
export function isSessionAbsolutelyExpired(createdAt: Date, now: Date, absoluteDays = DEFAULT_ABSOLUTE_DAYS): boolean {
  if (!Number.isFinite(absoluteDays) || absoluteDays <= 0) return false;
  return now.getTime() - createdAt.getTime() >= absoluteDays * DAY_MS;
}

export function readAbsoluteDays(raw = process.env.SESSION_ABSOLUTE_DAYS): number {
  const n = Number(raw ?? DEFAULT_ABSOLUTE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ABSOLUTE_DAYS;
}

export function readIdleDays(raw = process.env.SESSION_IDLE_DAYS): number {
  const n = Number(raw ?? DEFAULT_IDLE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_DAYS;
}
