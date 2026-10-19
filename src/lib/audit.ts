import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditMeta = Record<string, string | number | boolean | null>;

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  subjectUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: AuditMeta | null;
};

/** Best-effort audit write. Failures are logged and never break the caller. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      subject_user_id: input.subjectUserId ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      meta: input.meta ?? null,
    });
  } catch (error) {
    console.error("[audit] write failed:", error);
  }
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}
