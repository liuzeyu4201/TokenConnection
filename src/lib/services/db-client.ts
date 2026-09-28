import type { Db } from "@/db";

/** Either the root drizzle instance or a transaction handle. */
export type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Escape LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function likePattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

/** Today's date in the server's local timezone as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
