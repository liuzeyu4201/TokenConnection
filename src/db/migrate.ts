import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadDotEnv } from "./load-env";

loadDotEnv();

async function main() {
  const { closeDb, getAdminDb, getAdminSql } = await import("./index");
  const { ensureDatabaseRoles } = await import("./ensure-roles");
  const { enableRowLevelSecurity } = await import("./enable-rls");
  console.log("Ensuring database roles...");
  await ensureDatabaseRoles(getAdminSql());
  console.log("Running migrations from ./drizzle ...");
  await migrate(getAdminDb(), { migrationsFolder: "drizzle" });
  console.log("Migrations applied. Refreshing grants...");
  await ensureDatabaseRoles(getAdminSql());
  const rls = await enableRowLevelSecurity();
  console.log(`Row level security: ${rls}`);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
