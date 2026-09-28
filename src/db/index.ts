import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "@/lib/env";

import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// Reuse a single connection pool across hot reloads in development and create
// it lazily so importing this module never requires DATABASE_URL (tests,
// pure helpers, `next build`).
const globalForDb = globalThis as unknown as {
  __tokenconnectionSql?: ReturnType<typeof postgres>;
  __tokenconnectionDb?: Db;
};

export function getSql(): ReturnType<typeof postgres> {
  if (!globalForDb.__tokenconnectionSql) {
    globalForDb.__tokenconnectionSql = postgres(getDatabaseUrl(), {
      max: 10,
      idle_timeout: 30,
      // Silence NOTICE messages such as "extension already exists".
      onnotice: () => {},
    });
  }
  return globalForDb.__tokenconnectionSql;
}

export function getDb(): Db {
  if (!globalForDb.__tokenconnectionDb) {
    globalForDb.__tokenconnectionDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__tokenconnectionDb;
}

/** Lazy proxy: `db.select()` etc. resolve the real instance on first use. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

/** Close the pool (scripts). */
export async function closeDb(): Promise<void> {
  if (globalForDb.__tokenconnectionSql) {
    await globalForDb.__tokenconnectionSql.end();
    globalForDb.__tokenconnectionSql = undefined;
    globalForDb.__tokenconnectionDb = undefined;
  }
}

export { schema };
