import type { NextRequest } from "next/server";

import { json, parseBody, parseQuery, route } from "@/lib/api/handler";
import { TagCreateSchema, TagsQuerySchema } from "@/lib/schemas/tag";
import { createTag, listTags } from "@/lib/services/tags";

export const GET = route(async (request: NextRequest, _ctx, auth) => {
  const query = parseQuery(request, TagsQuerySchema);
  return json({ items: await listTags(auth, query.kind) });
}, { scope: "tags:read" });

export const POST = route(async (request: NextRequest, _ctx, auth) => {
  const input = await parseBody(request, TagCreateSchema);
  return json(await createTag(auth, input), { status: 201 });
}, { scope: "tags:write" });
