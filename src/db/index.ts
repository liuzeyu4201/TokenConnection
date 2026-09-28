import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "@/lib/env";

import * as schema from "./schema";

// Reuse a single connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as {
  __tokenconnectionSql?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(getDatabaseUrl(), {
    max: 10,
    idle_timeout: 30,
    // Silence NOTICE messages such as "extension already exists".
    onnotice: () => {},
  });
}

export const sql =
  globalForDb.__tokenconnectionSql ??
  (globalForDb.__tokenconnectionSql = createClient());

export const db = drizzle(sql, { schema });

export type Db = typeof db;
export { schema };
