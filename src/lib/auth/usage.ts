import { sql } from "drizzle-orm";

import { db } from "@/db";
import { llmUsage } from "@/db/schema";
import { todayIso } from "@/lib/services/db-client";
import { isOverQuota, readQuotaLimits, usageCount, type QuotaKind, type QuotaLimits, type QuotaUsage } from "@/lib/llm/quota";

const ZERO: QuotaUsage = { extract_count: 0, vision_count: 0, embed_count: 0 };

export async function readUsage(userId: string, day = todayIso()): Promise<QuotaUsage> {
  const [row] = await db
    .select({
      extract_count: llmUsage.extract_count,
      vision_count: llmUsage.vision_count,
      embed_count: llmUsage.embed_count,
    })
    .from(llmUsage)
    .where(sql`${llmUsage.user_id} = ${userId} and ${llmUsage.day} = ${day}`)
    .limit(1);
  return row ?? { ...ZERO };
}

/**
 * Reserve one unit if the user is still under the daily cap.
 * The increment and the cap check happen in one statement, so concurrent
 * requests cannot all pass a stale read.
 */
export async function consumeQuota(
  userId: string,
  kind: QuotaKind,
  limits: QuotaLimits = readQuotaLimits(),
  day = todayIso(),
): Promise<{ ok: true; usage: QuotaUsage } | { ok: false; usage: QuotaUsage; limits: QuotaLimits }> {
  const column = kind === "extract" ? "extract_count" : kind === "vision" ? "vision_count" : "embed_count";
  const cap = limits[kind];
  const rows = await db.execute<{ extract_count: number; vision_count: number; embed_count: number }>(sql`
    insert into llm_usage (user_id, day, ${sql.raw(column)})
    values (${userId}, ${day}, 1)
    on conflict (user_id, day) do update
      set ${sql.raw(column)} = llm_usage.${sql.raw(column)} + 1
      where llm_usage.${sql.raw(column)} < ${cap}
    returning extract_count, vision_count, embed_count
  `);
  const row = rows[0];
  if (!row) {
    const usage = await readUsage(userId, day);
    return { ok: false, usage, limits };
  }
  const usage = {
    extract_count: Number(row.extract_count),
    vision_count: Number(row.vision_count),
    embed_count: Number(row.embed_count),
  };
  if (isOverQuota({ ...usage, [column]: usageCount(usage, kind) - 1 } as QuotaUsage, limits, kind) && usageCount(usage, kind) > limits[kind]) {
    return { ok: false, usage, limits };
  }
  return { ok: true, usage };
}
