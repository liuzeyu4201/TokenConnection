import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { events, inbox, people, tags, users } from "@/db/schema";
import { badRequest } from "@/lib/api/errors";
import type { ServiceContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/auth/tenant";
import { zipStore } from "@/lib/account/zip";

import { audit } from "@/lib/audit";
import { auth } from "./server";

export async function exportAccountZip(ctx: ServiceContext): Promise<Uint8Array> {
  const data = await withTenant(ctx, async (tx) => {
    const [personRows, tagRows, eventRows, inboxRows] = await Promise.all([
      tx.select().from(people).where(eq(people.owner_id, ctx.userId)),
      tx.select().from(tags).where(eq(tags.owner_id, ctx.userId)),
      tx.select().from(events).where(eq(events.owner_id, ctx.userId)),
      tx.select().from(inbox).where(eq(inbox.owner_id, ctx.userId)),
    ]);
    return { people: personRows, tags: tagRows, events: eventRows, inbox: inboxRows };
  });
  const file = (name: string, value: unknown) => ({
    name,
    data: Buffer.from(JSON.stringify(value, null, 2)),
  });
  return zipStore([
    file("people.json", data.people),
    file("tags.json", data.tags),
    file("events.json", data.events),
    file("inbox.json", data.inbox),
  ]);
}

/**
 * Delete this user. Collected copies in other libraries stay; their source
 * line falls back to 「已注销用户」 because the user row is gone.
 */
export async function deleteOwnAccount(ctx: ServiceContext, password: string): Promise<void> {
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  if (!user) throw badRequest("账号不存在");
  if (user.role === "admin" && user.status === "active") {
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")));
    if ((count?.n ?? 0) <= 1) throw badRequest("不能删除最后一个管理员");
  }
  try {
    await auth.api.signInEmail({ body: { email: user.email, password } });
  } catch {
    throw badRequest("密码不正确", "unauthorized");
  }
  await audit({ actorUserId: ctx.userId, action: "account.deleted", targetType: "user", targetId: ctx.userId });
  await db.delete(users).where(eq(users.id, ctx.userId));
}
