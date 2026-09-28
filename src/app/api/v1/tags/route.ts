import type { NextRequest } from "next/server";

import { json, parseBody, parseQuery, route } from "@/lib/api/handler";
import { TagCreateSchema, TagsQuerySchema } from "@/lib/schemas/tag";
import { createTag, listTags } from "@/lib/services/tags";

/** GET /api/v1/tags?kind= */
export const GET = route(async (request: NextRequest) => {
  const query = parseQuery(request, TagsQuerySchema);
  const items = await listTags(query.kind);
  return json({ items });
});

/** POST /api/v1/tags */
export const POST = route(async (request: NextRequest) => {
  const input = await parseBody(request, TagCreateSchema);
  const tag = await createTag(input);
  return json(tag, { status: 201 });
});
