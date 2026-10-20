import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { notFound } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { db } from "@/db";
import { passkeys } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, auth.userId)))
    .returning({ id: passkeys.id });
  if (!row) throw notFound("这把 Passkey 不存在");
  await audit({ actorUserId: auth.userId, action: "auth.passkey.deleted", targetType: "passkey", targetId: id });
  return json({ ok: true });
}, { session: "required" });
