import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { SetPersonTagsSchema } from "@/lib/schemas/person";
import { setPersonTags } from "@/lib/services/people";

type Ctx = RouteContext<"/api/v1/people/[id]/tags">;

export const PUT = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, SetPersonTagsSchema);
  return json(await setPersonTags(auth, requireUuid(id), input.tags));
}, { scope: "people:write" });
