import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { SetPersonTagsSchema } from "@/lib/schemas/person";
import { setPersonTags } from "@/lib/services/people";

type Ctx = RouteContext<"/api/v1/people/[id]/tags">;

/** PUT /api/v1/people/:id/tags — replace the whole tag set */
export const PUT = route(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, SetPersonTagsSchema);
  const person = await setPersonTags(requireUuid(id), input.tags);
  return json(person);
});
