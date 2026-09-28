import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadDotEnv } from "@/lib/env";

loadDotEnv();

async function main() {
  // Import lazily so `.env` is loaded before the pool reads DATABASE_URL.
  const { db, sql } = await import("./index");
  console.log("Running migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
