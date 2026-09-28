import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { TagUpdateSchema } from "@/lib/schemas/tag";
import { deleteTag, updateTag } from "@/lib/services/tags";

type Ctx = RouteContext<"/api/v1/tags/[id]">;

/** PATCH /api/v1/tags/:id — rename or change kind */
export const PATCH = route(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, TagUpdateSchema);
  const tag = await updateTag(requireUuid(id), input);
  return json(tag);
});

/** DELETE /api/v1/tags/:id */
export const DELETE = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteTag(requireUuid(id));
  return json({ ok: true });
});
