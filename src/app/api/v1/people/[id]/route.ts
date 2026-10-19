import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { PersonUpdateSchema } from "@/lib/schemas/person";
import { deletePerson, getPersonDetail, updatePerson } from "@/lib/services/people";

type Ctx = RouteContext<"/api/v1/people/[id]">;

export const GET = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json(await getPersonDetail(auth, requireUuid(id)));
}, { scope: "people:read" });

export const PATCH = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, PersonUpdateSchema);
  return json(await updatePerson(auth, requireUuid(id), input));
}, { scope: "people:write" });

export const DELETE = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  await deletePerson(auth, requireUuid(id));
  return json({ ok: true });
}, { scope: "people:write" });
