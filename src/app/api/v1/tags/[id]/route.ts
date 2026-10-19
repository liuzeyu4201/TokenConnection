import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { TagUpdateSchema } from "@/lib/schemas/tag";
import { deleteTag, updateTag } from "@/lib/services/tags";

type Ctx = RouteContext<"/api/v1/tags/[id]">;

export const PATCH = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, TagUpdateSchema);
  return json(await updateTag(auth, requireUuid(id), input));
}, { scope: "tags:write" });

export const DELETE = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  await deleteTag(auth, requireUuid(id));
  return json({ ok: true });
}, { scope: "tags:write" });
