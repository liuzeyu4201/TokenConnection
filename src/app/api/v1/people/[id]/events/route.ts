import type { NextRequest } from "next/server";

import { json, parseBody, requireUuid, route } from "@/lib/api/handler";
import { EventCreateSchema } from "@/lib/schemas/event";
import { addEvent, listEvents } from "@/lib/services/events";

type Ctx = RouteContext<"/api/v1/people/[id]/events">;

export const GET = route(async (_request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  return json({ items: await listEvents(auth, requireUuid(id)) });
}, { scope: "people:read" });

export const POST = route(async (request: NextRequest, ctx: Ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, EventCreateSchema);
  return json(await addEvent(auth, requireUuid(id), input), { status: 201 });
}, { scope: "people:write" });
