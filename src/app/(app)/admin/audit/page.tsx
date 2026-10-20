import type { Metadata } from "next";
import Link from "next/link";
import { desc, ilike } from "drizzle-orm";

import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "审计" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin("/admin/audit");
  const raw = await searchParams;
  const action = (Array.isArray(raw.action) ? raw.action[0] : raw.action)?.trim() ?? "";
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      target_type: auditLog.target_type,
      actor_user_id: auditLog.actor_user_id,
      created_at: auditLog.created_at,
    })
    .from(auditLog)
    .where(action ? ilike(auditLog.action, `%${action.replace(/[%_]/g, "")}%`) : undefined)
    .orderBy(desc(auditLog.created_at))
    .limit(50);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">审计</h1>
          <p className="text-sm text-muted-foreground">只显示动作类型，不显示人脉内容。</p>
        </div>
        <Link href="/admin/users" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          用户
        </Link>
      </div>
      <form className="flex gap-2">
        <input name="action" defaultValue={action} placeholder="按动作过滤，例如 share" className="h-8 rounded-md border bg-background px-2 text-sm" />
        <button className="h-8 rounded-md border px-3 text-sm" type="submit">
          筛选
        </button>
      </form>
      <ul className="divide-y rounded-xl border bg-card text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <span className="font-mono text-xs">{row.action}</span>
            <span className="text-xs text-muted-foreground">
              {row.target_type ?? "—"} · {formatRelative(row.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

