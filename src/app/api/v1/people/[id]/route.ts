import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { PersonUpdateSchema } from "@/lib/schemas/person";
import { deletePerson, getPersonDetail, updatePerson } from "@/lib/services/people";

type Ctx = RouteContext<"/api/v1/people/[id]">;

/** GET /api/v1/people/:id — detail with tags and recent events */
export const GET = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const person = await getPersonDetail(requireUuid(id));
  return json(person);
});

/** PATCH /api/v1/people/:id */
export const PATCH = route(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, PersonUpdateSchema);
  const person = await updatePerson(requireUuid(id), input);
  return json(person);
});

/** DELETE /api/v1/people/:id */
export const DELETE = route(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deletePerson(requireUuid(id));
  return json({ ok: true });
});
