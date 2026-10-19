import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getAdminDatabaseUrl, getDatabaseUrl } from "@/lib/env";

import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// Reuse a single connection pool across hot reloads in development and create
// it lazily so importing this module never requires DATABASE_URL (tests,
// pure helpers, `next build`).
const globalForDb = globalThis as unknown as {
  __tokenconnectionSql?: ReturnType<typeof postgres>;
  __tokenconnectionDb?: Db;
  __tokenconnectionAdminSql?: ReturnType<typeof postgres>;
  __tokenconnectionAdminDb?: Db;
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

/** Owner / superuser pool for migrations, seed and reembed. Falls back to DATABASE_URL. */
export function getAdminSql(): ReturnType<typeof postgres> {
  if (!globalForDb.__tokenconnectionAdminSql) {
    globalForDb.__tokenconnectionAdminSql = postgres(getAdminDatabaseUrl(), {
      max: 5,
      idle_timeout: 30,
      onnotice: () => {},
    });
  }
  return globalForDb.__tokenconnectionAdminSql;
}

export function getAdminDb(): Db {
  if (!globalForDb.__tokenconnectionAdminDb) {
    globalForDb.__tokenconnectionAdminDb = drizzle(getAdminSql(), { schema });
  }
  return globalForDb.__tokenconnectionAdminDb;
}

/** Close the pool (scripts). */
export async function closeDb(): Promise<void> {
  if (globalForDb.__tokenconnectionSql) {
    await globalForDb.__tokenconnectionSql.end();
    globalForDb.__tokenconnectionSql = undefined;
    globalForDb.__tokenconnectionDb = undefined;
  }
  if (globalForDb.__tokenconnectionAdminSql) {
    await globalForDb.__tokenconnectionAdminSql.end();
    globalForDb.__tokenconnectionAdminSql = undefined;
    globalForDb.__tokenconnectionAdminDb = undefined;
  }
}

export { schema };
