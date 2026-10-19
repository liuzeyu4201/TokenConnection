import type postgres from "postgres";

/** Create tc_owner (BYPASSRLS, for migrations) and tc_app (NOBYPASSRLS, for the app). */
export async function ensureDatabaseRoles(sql: ReturnType<typeof postgres>): Promise<void> {
  const [role] = await sql<{ rolsuper: boolean }[]>`select rolsuper from pg_roles where rolname = current_user`;
  if (!role?.rolsuper) {
    console.warn("[roles] 当前连接不是超级用户，跳过创建 tc_app / tc_owner");
    return;
  }
  const appPass = (process.env.TC_APP_PASSWORD || "tc_app_dev").replace(/'/g, "''");
  const ownerPass = (process.env.TC_OWNER_PASSWORD || "tc_owner_dev").replace(/'/g, "''");
  await sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_owner') THEN
        CREATE ROLE tc_owner LOGIN PASSWORD '${ownerPass}' BYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_app') THEN
        CREATE ROLE tc_app LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END $$;
  `);
  await sql.unsafe(`
    GRANT CONNECT ON DATABASE ${await currentDb(sql)} TO tc_app, tc_owner;
    GRANT USAGE ON SCHEMA public TO tc_app, tc_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tc_app;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tc_owner;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tc_app, tc_owner;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tc_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO tc_owner;
  `);
}

async function currentDb(sql: ReturnType<typeof postgres>): Promise<string> {
  const [row] = await sql<{ name: string }[]>`select current_database() as name`;
  const name = row?.name ?? "tokenconnection";
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("unexpected database name");
  return name;
}
