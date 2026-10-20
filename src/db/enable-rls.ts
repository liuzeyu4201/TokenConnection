import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { getAdminDb, getAdminSql } from "@/db";
import { unclaimedContentCount } from "@/lib/auth/bootstrap";

export type RlsApplyResult = "enabled" | "already" | "deferred";

/** Turn on NOT NULL + FORCE RLS once every content row has an owner. Idempotent. */
export async function enableRowLevelSecurity(): Promise<RlsApplyResult> {
  await applySharePolicies();
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

/** Share-table policies. Safe to run every migrate, including after people RLS is already on. */
export async function applySharePolicies(): Promise<void> {
  const admin = getAdminDb();
  const [row] = await admin.execute<{ name: string | null }>(sql`select to_regclass('public.shares')::text as name`);
  if (!row?.name) return;
  const file = join(process.cwd(), "drizzle/0004_share_rls.sql");
  const script = readFileSync(file, "utf8");
  const statements = script
    .split(";")
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  const raw = getAdminSql();
  for (const statement of statements) {
    await raw.unsafe(statement);
  }
}
