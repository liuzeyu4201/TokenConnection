import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbClient } from "@/lib/services/db-client";

import type { ServiceContext } from "./context";

/**
 * Run `fn` in a transaction with `app.user_id` set for Postgres RLS.
 * The setting is transaction-local (`set_config` third arg `true`) and clears
 * when the transaction ends, so pooled connections stay safe.
 *
 * Do not open another `db.transaction` inside `fn`. Pass `tx` down.
 * Nested work should use `tx.transaction` (a savepoint) if it needs one.
 */
export async function withTenant<T>(ctx: ServiceContext, fn: (tx: DbClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    return fn(tx);
  });
}

/** Visitor read of a share link. Sets `app.share_token_hash` for the RLS policy. */
export async function withShareToken<T>(tokenHash: string, fn: (tx: DbClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.share_token_hash', ${tokenHash}, true)`);
    return fn(tx);
  });
}

/**
 * Logged-in visitor collecting a link. Both settings are required: inbox writes
 * check `app.user_id`, and the foreign key into `shares` / `share_items` is
 * only visible while the link hash is set.
 */
export async function withUserAndShareToken<T>(
  ctx: ServiceContext,
  tokenHash: string,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    await tx.execute(sql`select set_config('app.share_token_hash', ${tokenHash}, true)`);
    return fn(tx);
  });
}

/** Use an existing transaction when the caller already holds one. */
export async function inTenant<T>(
  ctx: ServiceContext,
  client: DbClient | undefined,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  if (client) return fn(client);
  return withTenant(ctx, fn);
}
