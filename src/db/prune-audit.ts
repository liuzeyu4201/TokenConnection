import { loadDotEnv } from "./load-env";

loadDotEnv();

const DEFAULT_DAYS = 180;

async function main() {
  const days = Number(process.env.AUDIT_RETENTION_DAYS ?? DEFAULT_DAYS);
  const keepDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_DAYS;
  const { getAdminSql, closeDb } = await import("./index");
  const sql = getAdminSql();
  const deleted = await sql`
    delete from audit_log
    where created_at < now() - (${keepDays}::text || ' days')::interval
    returning id
  `;
  console.log(`删除了 ${deleted.length} 条超过 ${keepDays} 天的审计记录`);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
