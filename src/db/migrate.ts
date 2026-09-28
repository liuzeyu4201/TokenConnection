import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadDotEnv } from "@/lib/env";

loadDotEnv();

async function main() {
  const { closeDb, getDb } = await import("./index");
  console.log("Running migrations from ./drizzle ...");
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
