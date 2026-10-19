import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { getAdminDb, getAdminSql } from "@/db";
import { unclaimedContentCount } from "@/lib/auth/bootstrap";

export type RlsApplyResult = "enabled" | "already" | "deferred";

/** Turn on NOT NULL + FORCE RLS once every content row has an owner. Idempotent. */
export async function enableRowLevelSecurity(): Promise<RlsApplyResult> {
  const admin = getAdminDb();
  const [flag] = await admin.execute<{ relrowsecurity: boolean }>(sql`
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'people'
  `);
  if (flag?.relrowsecurity) return "already";
  const pending = await unclaimedContentCount();
  if (pending > 0) {
    console.warn(`[rls] ${pending} 行还没有 owner_id，先完成 /setup 再启用行级安全`);
    return "deferred";
  }
  const file = join(process.cwd(), "drizzle/0003_owner_not_null_and_rls.sql");
  const script = readFileSync(file, "utf8");
  const statements = script
    .split(";")
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  const raw = getAdminSql();
  for (const statement of statements) {
    await raw.unsafe(statement);
  }
  console.log("[rls] owner_id NOT NULL + FORCE ROW LEVEL SECURITY 已启用");
  return "enabled";
}
